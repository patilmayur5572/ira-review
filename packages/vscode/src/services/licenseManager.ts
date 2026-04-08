/**
 * Copyright (c) IRA - Intelligent Review Assistant
 * License Manager — Polar.sh license key validation
 */

import * as vscode from 'vscode';
import * as msg from '../utils/messages';

const POLAR_API = 'https://api.polar.sh/v1/customer-portal/license-keys';

function getPolarOrgId(): string {
  const orgId = vscode.workspace.getConfiguration('ira').get<string>('polarOrganizationId', '');
  if (!orgId) {
    throw new Error('Polar Organization ID not configured. Go to Settings → IRA → Polar Organization ID.');
  }
  return orgId;
}

interface LicenseCache {
  valid: boolean;
  status: string;
  activationId: string | null;
  checkedAt: number;
}

export class LicenseManager {
  private static instance: LicenseManager;
  private context: vscode.ExtensionContext;
  private secrets: vscode.SecretStorage;
  private _onDidChangeLicense = new vscode.EventEmitter<boolean>();
  readonly onDidChangeLicense = this._onDidChangeLicense.event;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.secrets = context.secrets;
  }

  static init(context: vscode.ExtensionContext): LicenseManager {
    if (!LicenseManager.instance) {
      LicenseManager.instance = new LicenseManager(context);
    }
    return LicenseManager.instance;
  }

  static getInstance(): LicenseManager {
    if (!LicenseManager.instance) {
      throw new Error('LicenseManager not initialized. Call LicenseManager.init() first.');
    }
    return LicenseManager.instance;
  }

  async isPro(): Promise<boolean> {
    const cached = this.context.globalState.get<LicenseCache>('ira-license');
    if (cached && Date.now() - cached.checkedAt < 86400000) {
      return cached.valid;
    }

    const key = await this.secrets.get('ira-license-key');
    if (!key) return false;

    try {
      const activationId = cached?.activationId ?? null;
      const body: Record<string, unknown> = {
        key,
        organization_id: getPolarOrgId(),
      };
      if (activationId) {
        body.activation_id = activationId;
      }

      const res = await fetch(`${POLAR_API}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (res.status === 404) {
          await this.context.globalState.update('ira-license', {
            valid: false,
            status: 'invalid',
            activationId: null,
            checkedAt: Date.now(),
          } satisfies LicenseCache);
          return false;
        }
        throw new Error(`Polar API error: ${res.status}`);
      }

      const data = await res.json() as { status: string; activation?: { id: string } };
      const valid = data.status === 'granted';

      await this.context.globalState.update('ira-license', {
        valid,
        status: data.status,
        activationId: data.activation?.id ?? activationId,
        checkedAt: Date.now(),
      } satisfies LicenseCache);

      return valid;
    } catch {
      if (cached && Date.now() - cached.checkedAt < 7 * 86400000) { // 7-day offline grace
        return cached.valid;
      }
      return false;
    }
  }

  async activateLicense(): Promise<boolean> {
    const key = await vscode.window.showInputBox({
      prompt: 'Enter your IRA Pro license key',
      placeHolder: 'IRA_XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX',
      password: true,
      ignoreFocusOut: true,
    });

    if (!key) return false;

    try {
      const res = await fetch(`${POLAR_API}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          organization_id: getPolarOrgId(),
          label: vscode.env.machineId,
          meta: {
            app: 'ira-vscode',
            machine_id: vscode.env.machineId,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({})) as { detail?: string };
        if (res.status === 403) {
          vscode.window.showErrorMessage('License activation limit reached. Deactivate a device first at polar.sh.');
        } else if (res.status === 404) {
          vscode.window.showErrorMessage('Invalid license key. Please check and try again.');
        } else {
          vscode.window.showErrorMessage(`License activation failed: ${errorData.detail ?? res.statusText}`);
        }
        return false;
      }

      const data = await res.json() as { id: string; license_key?: { status: string } };
      await this.secrets.store('ira-license-key', key);
      await this.context.globalState.update('ira-license', {
        valid: true,
        status: data.license_key?.status ?? 'granted',
        activationId: data.id,
        checkedAt: Date.now(),
      } satisfies LicenseCache);

      this._onDidChangeLicense.fire(true);
      vscode.window.showInformationMessage(msg.proActivated());
      return true;
    } catch {
      vscode.window.showErrorMessage('Could not activate license. Check your internet connection.');
      return false;
    }
  }

  async deactivateLicense(): Promise<void> {
    const key = await this.secrets.get('ira-license-key');
    const cached = this.context.globalState.get<LicenseCache>('ira-license');

    if (key && cached?.activationId) {
      try {
        await fetch(`${POLAR_API}/deactivate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key,
            organization_id: getPolarOrgId(),
            activation_id: cached.activationId,
          }),
        });
      } catch {
        // Best effort
      }
    }

    await this.secrets.delete('ira-license-key');
    await this.context.globalState.update('ira-license', undefined);
    this._onDidChangeLicense.fire(false);
    vscode.window.showInformationMessage(msg.proDeactivated());
  }

  async showProUpsell(feature: string): Promise<void> {
    const action = await vscode.window.showInformationMessage(
      `⭐ "${feature}" is a Pro feature. Upgrade for $10/mo to unlock auto-review, one-click fixes, and more.`,
      'Enter License Key',
      'Learn More'
    );

    if (action === 'Enter License Key') {
      await this.activateLicense();
    } else if (action === 'Learn More') {
      const checkoutUrl = vscode.workspace.getConfiguration('ira').get<string>('proCheckoutUrl', 'https://polar.sh');
      vscode.env.openExternal(vscode.Uri.parse(checkoutUrl));
    }
  }

  dispose(): void {
    this._onDidChangeLicense.dispose();
  }
}
