import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../src/store/appStore';

describe('appStore contact send-flow integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useAppStore.setState({
      contacts: [],
      recentRecipients: [],
    });
  });

  it('migrates the legacy send-flow contact store once', async () => {
    await AsyncStorage.setItem(
      'pocketpay-contacts',
      JSON.stringify({
        state: {
          contacts: [
            { id: 'legacy-1', name: 'Alice', address: ' gaaa ' },
          ],
          recentRecipients: [' gaaa ', 'gbbb'],
        },
        version: 0,
      }),
    );

    useAppStore.setState({
      contacts: [],
      recentRecipients: [],
      isInitialized: false,
    });

    await useAppStore.getState().initializeApp();

    expect(useAppStore.getState().contacts).toEqual([
      { id: 'legacy-1', name: 'Alice', publicKey: 'GAAA' },
    ]);
    expect(useAppStore.getState().recentRecipients).toEqual(['GAAA', 'GBBB']);
    expect(await AsyncStorage.getItem('pocketpay-contacts')).toBeNull();

    await useAppStore.getState().removeContact('legacy-1');
    await useAppStore.getState().initializeApp();
    expect(useAppStore.getState().contacts).toEqual([]);
  });

  it('keeps five normalized, deduplicated recent recipients with newest first', async () => {
    const { addRecentRecipient } = useAppStore.getState();

    for (const address of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']) {
      await addRecentRecipient(address);
    }
    await addRecentRecipient(' G3 ');

    expect(useAppStore.getState().recentRecipients).toEqual([
      'G3',
      'G6',
      'G5',
      'G4',
      'G2',
    ]);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
      '@pocketpay_recent_recipients',
      JSON.stringify(['G3', 'G6', 'G5', 'G4', 'G2']),
    );
  });

  it('rejects an edit that would duplicate another contact address', async () => {
    useAppStore.setState({
      contacts: [
        { id: '1', name: 'Alice', publicKey: 'GAAA' },
        { id: '2', name: 'Bob', publicKey: 'GBBB' },
      ],
    });

    const result = await useAppStore
      .getState()
      .updateContact('2', 'Bob', ' gaaa ');

    expect(result).toMatchObject({
      isDuplicate: true,
      type: 'address',
    });
    expect(useAppStore.getState().contacts[1]).toEqual({
      id: '2',
      name: 'Bob',
      publicKey: 'GBBB',
    });
  });

  it('updates both name and address when the edit remains unique', async () => {
    useAppStore.setState({
      contacts: [
        { id: '1', name: 'Alice', publicKey: 'GAAA' },
        { id: '2', name: 'Bob', publicKey: 'GBBB' },
      ],
    });

    const result = await useAppStore
      .getState()
      .updateContact('2', ' Bobby ', ' gccc ');

    expect(result.isDuplicate).toBe(false);
    expect(useAppStore.getState().contacts[1]).toEqual({
      id: '2',
      name: 'Bobby',
      publicKey: 'GCCC',
    });
  });
});
