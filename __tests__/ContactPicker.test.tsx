import { render, screen, fireEvent } from '@testing-library/react-native';
import { ContactPicker } from '@/components/ContactPicker';
import { useAppStore } from '@/store/appStore';

// Mock the store
jest.mock('@/store/appStore', () => ({
  useAppStore: jest.fn(),
}));

describe('ContactPicker', () => {
  const mockOnSelect = jest.fn();
  const mockOnCancel = jest.fn();
  const mockOnAddNew = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when no contacts', () => {
    (useAppStore as jest.Mock).mockReturnValue({
      contacts: [],
      recentRecipients: [],
      findContactByPublicKey: jest.fn(),
    });

    render(
      <ContactPicker
        visible={true}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        onAddNew={mockOnAddNew}
      />
    );

    expect(screen.getByText('No contacts yet')).toBeTruthy();
  });

  it('renders saved contacts', () => {
    const mockContacts = [
      { id: '1', name: 'Alice', publicKey: 'GABC123', createdAt: Date.now() },
      { id: '2', name: 'Bob', publicKey: 'GDEF456', createdAt: Date.now() },
    ];

    (useAppStore as jest.Mock).mockReturnValue({
      contacts: mockContacts,
      recentRecipients: [],
      findContactByPublicKey: jest.fn(),
    });

    render(
      <ContactPicker
        visible={true}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        onAddNew={mockOnAddNew}
      />
    );

    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('renders recent recipients', () => {
    const mockFindContactByPublicKey = jest.fn((addr) => {
      if (addr === 'GABC123') return { name: 'Alice' };
      return null;
    });

    (useAppStore as jest.Mock).mockReturnValue({
      contacts: [],
      recentRecipients: ['GABC123', 'GXYZ789'],
      findContactByPublicKey: mockFindContactByPublicKey,
    });

    render(
      <ContactPicker
        visible={true}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        onAddNew={mockOnAddNew}
      />
    );

    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Unknown')).toBeTruthy();
  });

  it('calls onSelect when contact is pressed', () => {
    const mockContacts = [
      { id: '1', name: 'Alice', publicKey: 'GABC123', createdAt: Date.now() },
    ];

    (useAppStore as jest.Mock).mockReturnValue({
      contacts: mockContacts,
      recentRecipients: [],
      findContactByPublicKey: jest.fn(),
    });

    render(
      <ContactPicker
        visible={true}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        onAddNew={mockOnAddNew}
      />
    );

    fireEvent.press(screen.getByText('Alice'));
    expect(mockOnSelect).toHaveBeenCalledWith('GABC123');
  });

  it('calls onEdit for a saved contact', () => {
    const mockOnEdit = jest.fn();
    const contact = { id: '1', name: 'Alice', publicKey: 'GABC123' };

    (useAppStore as jest.Mock).mockReturnValue({
      contacts: [contact],
      recentRecipients: [],
      findContactByPublicKey: jest.fn(),
      removeContact: jest.fn(),
    });

    render(
      <ContactPicker
        visible={true}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        onAddNew={mockOnAddNew}
        onEdit={mockOnEdit}
      />
    );

    fireEvent.press(screen.getByLabelText('Edit Alice'));
    expect(mockOnEdit).toHaveBeenCalledWith(contact);
  });

  it('calls onAddNew when add button is pressed', () => {
    (useAppStore as jest.Mock).mockReturnValue({
      contacts: [],
      recentRecipients: [],
      findContactByPublicKey: jest.fn(),
    });

    render(
      <ContactPicker
        visible={true}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        onAddNew={mockOnAddNew}
      />
    );

    fireEvent.press(screen.getByText('Add New Contact'));
    expect(mockOnAddNew).toHaveBeenCalled();
  });

  it('filters contacts by search query', () => {
    const mockContacts = [
      { id: '1', name: 'Alice', publicKey: 'GABC123', createdAt: Date.now() },
      { id: '2', name: 'Bob', publicKey: 'GDEF456', createdAt: Date.now() },
    ];

    (useAppStore as jest.Mock).mockReturnValue({
      contacts: mockContacts,
      recentRecipients: [],
      findContactByPublicKey: jest.fn(),
    });

    render(
      <ContactPicker
        visible={true}
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
        onAddNew={mockOnAddNew}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search contacts...');
    fireEvent.changeText(searchInput, 'alice');

    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.queryByText('Bob')).toBeNull();
  });
});
