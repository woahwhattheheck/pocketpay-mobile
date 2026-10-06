import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ContactForm } from '@/components/ContactForm';
import { useAppStore } from '@/store/appStore';

// Mock the store
jest.mock('@/store/appStore', () => ({
  useAppStore: jest.fn(),
}));

const VALID_ADDRESS = `G${'A'.repeat(55)}`;

describe('ContactForm', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();
  const mockOnDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAppStore as jest.Mock).mockReturnValue({
      findDuplicateContact: jest.fn(() => ({
        isDuplicate: false,
        type: 'none',
        message: '',
      })),
    });
  });

  it('renders add contact form', () => {
    render(
      <ContactForm
        visible={true}
        contact={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Add Contact')).toBeTruthy();
    expect(screen.getByPlaceholderText('Contact name')).toBeTruthy();
    expect(screen.getByPlaceholderText('G...')).toBeTruthy();
  });

  it('renders edit contact form with pre-filled values', () => {
    const contact = { id: '1', name: 'Alice', publicKey: VALID_ADDRESS };

    render(
      <ContactForm
        visible={true}
        contact={contact}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('Edit Contact')).toBeTruthy();
    expect(screen.getByDisplayValue('Alice')).toBeTruthy();
    expect(screen.getByDisplayValue('GABC123')).toBeTruthy();
  });

  it('shows validation errors for empty fields', async () => {
    render(
      <ContactForm
        visible={true}
        contact={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeTruthy();
      expect(screen.getByText('Address is required')).toBeTruthy();
    });

    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('validates Stellar address format', async () => {
    render(
      <ContactForm
        visible={true}
        contact={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.changeText(screen.getByPlaceholderText('Contact name'), 'Alice');
    fireEvent.changeText(screen.getByPlaceholderText('G...'), 'invalid');

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(
        screen.getByText(/Invalid Stellar address/)
      ).toBeTruthy();
    });

    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('validates name length', async () => {
    const longName = 'A'.repeat(51);

    render(
      <ContactForm
        visible={true}
        contact={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.changeText(screen.getByPlaceholderText('Contact name'), longName);
    fireEvent.changeText(
      screen.getByPlaceholderText('G...'),
      VALID_ADDRESS
    );

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(
        screen.getByText('Name must be 50 characters or less')
      ).toBeTruthy();
    });

    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('detects duplicate address when adding new contact', async () => {
    const mockGetContactByAddress = jest.fn(() => ({
      id: '1',
      name: 'Existing',
      publicKey: VALID_ADDRESS,
    }));

    (useAppStore as jest.Mock).mockReturnValue({
      contacts: [{ id: '1', name: 'Existing', publicKey: VALID_ADDRESS, createdAt: Date.now() }],
      findDuplicateContact: mockGetContactByAddress,
    });

    render(
      <ContactForm
        visible={true}
        contact={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.changeText(screen.getByPlaceholderText('Contact name'), 'New Contact');
    fireEvent.changeText(screen.getByPlaceholderText('G...'), VALID_ADDRESS);

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(
        screen.getByText('Address already saved as "Existing"')
      ).toBeTruthy();
    });

    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('calls onSave with valid data', async () => {
    render(
      <ContactForm
        visible={true}
        contact={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.changeText(screen.getByPlaceholderText('Contact name'), 'Alice');
    fireEvent.changeText(
      screen.getByPlaceholderText('G...'),
      'GABC12345678901234567890123456789012345678901234567890'
    );

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        'Alice',
        VALID_ADDRESS
      );
    });
  });

  it('calls onCancel when cancel button is pressed', () => {
    render(
      <ContactForm
        visible={true}
        contact={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.press(screen.getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('shows delete button when editing contact', () => {
    const contact = { id: '1', name: 'Alice', publicKey: VALID_ADDRESS };

    render(
      <ContactForm
        visible={true}
        contact={contact}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('Delete Contact')).toBeTruthy();
  });

  it('calls onDelete when delete button is pressed', () => {
    const contact = { id: '1', name: 'Alice', publicKey: VALID_ADDRESS };

    render(
      <ContactForm
        visible={true}
        contact={contact}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.press(screen.getByText('Delete Contact'));
    expect(mockOnDelete).toHaveBeenCalled();
  });
});
