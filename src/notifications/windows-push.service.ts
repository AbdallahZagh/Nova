import { Injectable } from '@nestjs/common';

export const WNS_PLATFORM = 'windows-wns';
export const WNS_TOKEN_PREFIX = 'wns:';
const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function windowsChannel(value: string): URL | null {
  if (!value || value.length > 4096 || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    const windows = url.hostname.endsWith('.notify.windows.com');
    return url.protocol === 'https:' &&
      windows &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.pathname !== '/' || url.search)
      ? url
      : null;
  } catch {
    return null;
  }
}

@Injectable()
export class WindowsPushService {
  private access?: { token: string; expiresAt: number; appId: string };
  private requesting?: Promise<string>;

  private configuration() {
    const tenantId = process.env.NOVA_WNS_TENANT_ID?.trim();
    const appId = process.env.NOVA_WNS_APP_ID?.trim();
    const objectId = process.env.NOVA_WNS_OBJECT_ID?.trim();
    const secret = process.env.NOVA_WNS_CLIENT_SECRET;
    if (
      !tenantId ||
      !appId ||
      !objectId ||
      !secret ||
      !GUID.test(tenantId) ||
      !GUID.test(appId) ||
      !GUID.test(objectId)
    )
      return null;
    return { tenantId, appId, objectId, secret };
  }

  publicConfiguration() {
    const config = this.configuration();
    return config
      ? { enabled: true, appId: config.appId, objectId: config.objectId }
      : { enabled: false };
  }

  async deliver(
    channel: string,
  ): Promise<'accepted' | 'expired' | 'unavailable'> {
    const destination = windowsChannel(channel);
    if (!destination) return 'expired';
    const config = this.configuration();
    if (!config) return 'unavailable';
    let token = await this.getToken(config);
    let status = await this.signal(destination, token);
    if (status === 401) {
      if (this.access?.token === token) this.access = undefined;
      token = await this.getToken(config);
      status = await this.signal(destination, token);
    }
    if (status === 404 || status === 410) return 'expired';
    if (status !== 200) throw new Error(`Windows push returned HTTP ${status}`);
    return 'accepted';
  }

  private async signal(destination: URL, token: string) {
    const response = await fetch(destination, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(7000),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'X-WNS-Type': 'wns/raw',
        'X-WNS-Cache-Policy': 'no-cache',
        'X-WNS-TTL': '120',
      },
      // The signed-in desktop loads the real inbox. This signal carries no private content.
      body: 'nova-inbox',
    });
    await response.body?.cancel();
    return response.status;
  }

  private getToken(config: {
    tenantId: string;
    appId: string;
    secret: string;
  }): Promise<string> {
    if (
      this.access?.appId === config.appId &&
      this.access.expiresAt > Date.now()
    )
      return Promise.resolve(this.access.token);
    return (this.requesting ??= this.requestToken(config).finally(() => {
      this.requesting = undefined;
    }));
  }

  private async requestToken(config: {
    tenantId: string;
    appId: string;
    secret: string;
  }) {
    const response = await fetch(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(7000),
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: config.appId,
          client_secret: config.secret,
          scope: 'https://wns.windows.com/.default',
        }),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Windows push authentication returned HTTP ${response.status}`,
      );
    }
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number | string;
    };
    if (!payload.access_token)
      throw new Error('Windows push authentication returned no token');
    const lifetime = Number(payload.expires_in);
    this.access = {
      token: payload.access_token,
      appId: config.appId,
      expiresAt:
        Date.now() +
        (Number.isFinite(lifetime) ? Math.max(0, lifetime - 60) * 1000 : 0),
    };
    return payload.access_token;
  }
}
