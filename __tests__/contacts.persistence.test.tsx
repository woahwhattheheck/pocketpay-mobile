import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { useAppStore } from "../src/store/appStore";
import ContactsScreen from "../app/contacts";

jest.mock("../src/store/appStore");
jest.mock("../src/components/QrScanner", () => ({ QrScanner: () => null }));
jest.mock("../src/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm: jest.fn(), confirmationDialog: null }),
}));
jest.mock("../src/hooks/useTheme", () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock("lucide-react-native", () => ({
  Trash2: () => null, User: () => null,
  AlertTriangle: () => null, Pencil: () => null,
}));

const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3";
const existing = { id: "existing", name: "Alice", publicKey: ` ${address.toLowerCase()} ` };
const duplicate = { isDuplicate: true, type: "address", message: 'This address is already saved as "Alice".' };
const save = jest.fn();
const update = jest.fn();
const lookup = jest.fn();
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  (useAppStore as jest.MockedFunction<typeof useAppStore>).mockReturnValue({
    contacts: [], addContactIfUnique: save, updateContact: update,
    findContactByPublicKey: lookup,
    findDuplicateContact: () => ({ isDuplicate: false, type: "none", message: "" }),
  } as any);
});

afterEach(() => alert.mockRestore());

function openForm() {
  const screen = render(<ContactsScreen />);
  fireEvent.press(screen.getByLabelText("Add contact manually"));
  fireEvent.changeText(screen.getByLabelText("Contact name"), "Renamed");
  fireEvent.changeText(screen.getByLabelText("Stellar public key address"), address);
  return screen;
}

it("uses the latest normalized lookup for the duplicate update path", async () => {
  save.mockResolvedValue(duplicate);
  lookup.mockReturnValue(existing);
  update.mockResolvedValue(undefined);
  const screen = openForm();
  fireEvent.press(screen.getByLabelText("Save contact"));
  await waitFor(() => expect(screen.getByLabelText("Update existing contact")).toBeTruthy());
  expect(lookup).toHaveBeenCalledWith(address);
  fireEvent.press(screen.getByLabelText("Update existing contact"));
  await waitFor(() => expect(update).toHaveBeenCalledWith("existing", "Renamed"));
});

it("keeps entered values after a failed write and lets the user retry", async () => {
  save.mockRejectedValueOnce(new Error("disk full"));
  save.mockResolvedValueOnce({ isDuplicate: false, type: "none", message: "" });
  const screen = openForm();
  fireEvent.press(screen.getByLabelText("Save contact"));
  await waitFor(() => expect(alert).toHaveBeenCalledWith("Error", "Failed to save contact. Please try again."));
  expect(screen.getByLabelText("Contact name").props.value).toBe("Renamed");
  expect(screen.getByLabelText("Stellar public key address").props.value).toBe(address);
  fireEvent.press(screen.getByLabelText("Save contact"));
  await waitFor(() => expect(screen.getByLabelText("Add contact manually")).toBeTruthy());
  expect(save).toHaveBeenCalledTimes(2);
});
