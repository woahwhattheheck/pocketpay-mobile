import AsyncStorage from "@react-native-async-storage/async-storage";
import { Contact, useAppStore } from "../src/store/appStore";

jest.unmock("../src/store/appStore");
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const stored = new Map<string, string>();
const key = "@pocketpay_contacts";
const alice: Contact = { id: "a", name: "Alice", publicKey: "GABC" };
const bob: Contact = { id: "b", name: "Bob", publicKey: "GDEF" };
const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const state = () => useAppStore.getState();
const onNextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function defer() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  stored.clear();
  jest.resetAllMocks();
  useAppStore.setState({ contacts: [], isInitialized: false });
  getItem.mockImplementation(async (name: string) => stored.get(name) ?? null);
  setItem.mockImplementation(async (name: string, value: string) => {
    stored.set(name, value);
  });
});

it("publishes a normalized contact only after storage succeeds and reloads it", async () => {
  const gate = defer();
  setItem.mockImplementationOnce(async (name: string, value: string) => {
    await gate.promise;
    stored.set(name, value);
  });
  const save = state().addContact({ ...alice, name: " Alice ", publicKey: " gabc " });
  await onNextTurn();
  expect(state().contacts).toEqual([]);
  gate.resolve();
  await expect(save).resolves.toEqual({ success: true });
  expect(state().contacts).toEqual([alice]);
  useAppStore.setState({ contacts: [] });
  await state().initializeApp();
  expect(state().contacts).toEqual([alice]);
});

it("blocks normalized duplicate addresses but only warns on duplicate names", async () => {
  await state().addContact(alice);
  const duplicate = await state().addContactIfUnique({ ...bob, publicKey: " gabc " });
  expect(duplicate).toMatchObject({ isDuplicate: true, type: "address" });
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(state().findDuplicateContact(" alice ", bob.publicKey)).toMatchObject({
    isDuplicate: false, type: "name",
  });
  await expect(state().addContactIfUnique({ ...bob, name: " alice " }))
    .resolves.toMatchObject({ isDuplicate: false });
  expect(state().contacts).toHaveLength(2);
});

it("returns one success for simultaneous saves of the same address", async () => {
  const results = await Promise.all([
    state().addContactIfUnique(alice),
    state().addContactIfUnique({ ...bob, publicKey: " gabc " }),
  ]);
  expect(results.map((result) => result.isDuplicate)).toEqual([false, true]);
  expect(state().contacts).toEqual([alice]);
  expect(setItem).toHaveBeenCalledTimes(1);
});

it("serializes add, rename and delete snapshots behind a slow write", async () => {
  const gate = defer();
  setItem.mockImplementationOnce(async (name: string, value: string) => {
    await gate.promise;
    stored.set(name, value);
  });
  const operations = [
    state().addContact(alice), state().addContact(bob),
    state().updateContact("b", " Robert "), state().removeContact("a"),
  ];
  await onNextTurn();
  expect(setItem).toHaveBeenCalledTimes(1);
  gate.resolve();
  await Promise.all(operations);
  const expected = [{ ...bob, name: "Robert" }];
  expect(state().contacts).toEqual(expected);
  expect(JSON.parse(stored.get(key)!)).toEqual(expected);
});

it("does not commit a failed add and permits a retry after rejection", async () => {
  setItem.mockRejectedValueOnce(new Error("disk full"));
  await expect(state().addContactIfUnique(alice)).rejects.toThrow("disk full");
  expect(state().contacts).toEqual([]);
  expect(stored.has(key)).toBe(false);
  await expect(state().addContactIfUnique(alice)).resolves.toMatchObject({ isDuplicate: false });
  expect(state().contacts).toEqual([alice]);
});

it("preserves the committed contact when rename or delete storage fails", async () => {
  await state().addContact(alice);
  setItem.mockRejectedValueOnce(new Error("disk full"));
  await expect(state().updateContact("a", "Changed")).rejects.toThrow("disk full");
  setItem.mockRejectedValueOnce(new Error("disk full"));
  await expect(state().removeContact("a")).rejects.toThrow("disk full");
  expect(state().contacts).toEqual([alice]);
  expect(JSON.parse(stored.get(key)!)).toEqual([alice]);
});

it("finishes an in-flight initialization before deriving a new contact list", async () => {
  stored.set(key, JSON.stringify([alice]));
  const gate = defer();
  getItem.mockImplementationOnce(async () => {
    await gate.promise;
    return stored.get(key)!;
  });
  const initialized = state().initializeApp();
  const saved = state().addContact(bob);
  await onNextTurn();
  expect(setItem).not.toHaveBeenCalled();
  gate.resolve();
  await Promise.all([initialized, saved]);
  expect(state().contacts).toEqual([alice, bob]);
  expect(JSON.parse(stored.get(key)!)).toEqual([alice, bob]);
});
