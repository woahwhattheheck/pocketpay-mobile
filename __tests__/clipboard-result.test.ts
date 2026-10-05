import * as Clipboard from 'expo-clipboard';
import { copyToClipboard } from '../src/utils/clipboard';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const setStringAsync = Clipboard.setStringAsync as jest.MockedFunction<
  typeof Clipboard.setStringAsync
>;

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('copyToClipboard result contract', () => {
  it('reports success only after a confirmed write', async () => {
    setStringAsync.mockResolvedValueOnce(true);
    await expect(copyToClipboard('public-address')).resolves.toEqual({ ok: true });
    expect(setStringAsync).toHaveBeenCalledWith('public-address');
  });

  it('reports a resolved false result as failure rather than Copied', async () => {
    setStringAsync.mockResolvedValueOnce(false);
    await expect(copyToClipboard('public-address')).resolves.toEqual({
      ok: false,
      error: 'Clipboard did not accept the text.',
    });
    expect(setStringAsync).toHaveBeenCalledWith('public-address');
  });

  it('preserves the non-throwing result for rejected writes', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setStringAsync.mockRejectedValueOnce(new Error('Clipboard unavailable'));
    await expect(copyToClipboard('public-address')).resolves.toEqual({
      ok: false,
      error: 'Error: Clipboard unavailable',
    });
  });
});
