import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';
import { LicenseManager } from '../services/licenseManager';
import * as vscode from 'vscode';

const mockSecrets = {
  get: vi.fn(),
  store: vi.fn(),
  delete: vi.fn(),
  onDidChange: vi.fn(),
};
const mockGlobalState = {
  get: vi.fn(),
  update: vi.fn(),
  keys: vi.fn(() => []),
  setKeysForSync: vi.fn(),
};
const mockContext = {
  secrets: mockSecrets,
  globalState: mockGlobalState,
  subscriptions: [],
  extensionUri: { fsPath: '/test' },
} as any;

describe('LicenseManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (LicenseManager as any)['instance'] = undefined;
    (global as any).fetch = vi.fn();
  });

  it('isPro() returns false when no license key stored', async () => {
    const lm = LicenseManager.init(mockContext);
    mockGlobalState.get.mockReturnValue(undefined);
    mockSecrets.get.mockResolvedValue(undefined);

    const result = await lm.isPro();
    expect(result).toBe(false);
  });

  it('isPro() returns cached result within 24 hours', async () => {
    const lm = LicenseManager.init(mockContext);
    mockGlobalState.get.mockReturnValue({
      valid: true,
      status: 'granted',
      activationId: 'act-123',
      checkedAt: Date.now() - 1000,
    });

    const result = await lm.isPro();
    expect(result).toBe(true);
    expect(mockSecrets.get).not.toHaveBeenCalled();
  });

  it('isPro() returns true for valid cached license within offline grace period (7 days)', async () => {
    const lm = LicenseManager.init(mockContext);
    mockGlobalState.get.mockReturnValue({
      valid: true,
      status: 'granted',
      activationId: 'act-123',
      checkedAt: Date.now() - 2 * 86400000,
    });
    mockSecrets.get.mockResolvedValue('IRA_KEY');
    (global as any).fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await lm.isPro();
    expect(result).toBe(true);
  });

  it('isPro() returns false when cache expired beyond 7 days and no network', async () => {
    const lm = LicenseManager.init(mockContext);
    mockGlobalState.get.mockReturnValue({
      valid: true,
      status: 'granted',
      activationId: 'act-123',
      checkedAt: Date.now() - 8 * 86400000,
    });
    mockSecrets.get.mockResolvedValue('IRA_KEY');
    (global as any).fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await lm.isPro();
    expect(result).toBe(false);
  });

  it('activateLicense() returns false when user cancels input', async () => {
    const lm = LicenseManager.init(mockContext);
    (vscode.window.showInputBox as any).mockResolvedValue(undefined);

    const result = await lm.activateLicense();
    expect(result).toBe(false);
  });

  it('deactivateLicense() clears secrets and cache', async () => {
    const lm = LicenseManager.init(mockContext);
    mockSecrets.get.mockResolvedValue('IRA_KEY');
    mockGlobalState.get.mockReturnValue({ activationId: 'act-123' });
    (global as any).fetch = vi.fn().mockResolvedValue({ ok: true });

    await lm.deactivateLicense();

    expect(mockSecrets.delete).toHaveBeenCalledWith('ira-license-key');
    expect(mockGlobalState.update).toHaveBeenCalledWith('ira-license', undefined);
  });

  it('showProUpsell() shows information message with correct options', async () => {
    const lm = LicenseManager.init(mockContext);
    (vscode.window.showInformationMessage as any).mockResolvedValue(undefined);

    await lm.showProUpsell('Auto-review');

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Auto-review'),
      'Enter License Key',
      'Learn More'
    );
  });
});
