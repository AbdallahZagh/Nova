import { getMessaging } from 'firebase-admin/messaging';
import { NotificationsService } from './notifications.service';
import {
  windowsChannel,
  WindowsPushService,
  WNS_PLATFORM,
} from './windows-push.service';

jest.mock('firebase-admin/messaging', () => ({ getMessaging: jest.fn() }));

describe('Windows inbox push', () => {
  const tenant = '10000000-0000-4000-8000-000000000001';
  const app = '10000000-0000-4000-8000-000000000002';
  const object = '10000000-0000-4000-8000-000000000003';
  const channel = 'https://db5p.notify.windows.com/?token=fixture-channel';
  const env = { ...process.env };

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...env };
  });

  function enable() {
    process.env.NOVA_WNS_TENANT_ID = tenant;
    process.env.NOVA_WNS_APP_ID = app;
    process.env.NOVA_WNS_OBJECT_ID = object;
    process.env.NOVA_WNS_CLIENT_SECRET = 'fixture-secret';
  }

  it('advertises public IDs only when a complete Windows registration is configured', () => {
    delete process.env.NOVA_WNS_CLIENT_SECRET;
    const service = new WindowsPushService();
    expect(service.publicConfiguration()).toEqual({ enabled: false });
    enable();
    expect(service.publicConfiguration()).toEqual({
      enabled: true,
      appId: app,
      objectId: object,
    });
  });

  it.each([
    'https://notify.windows.com.attacker.invalid/?token=wrong',
    'https://notify.windows.com@attacker.invalid/?token=wrong',
    'http://db5p.notify.windows.com/?token=wrong',
    'https://db5p.notify.windows.com:8443/?token=wrong',
  ])(
    'rejects invalid channel endpoints before using credentials (%s)',
    async (url) => {
      enable();
      const fetch = jest.spyOn(globalThis, 'fetch');
      expect(windowsChannel(url)).toBeNull();
      await expect(new WindowsPushService().deliver(url)).resolves.toBe(
        'expired',
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('uses Entra credentials to deliver a private-content-free WNS signal and renews an expired token once', async () => {
    enable();
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ access_token: 'first', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({ access_token: 'renewed', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 410 }));
    const service = new WindowsPushService();
    await expect(service.deliver(channel)).resolves.toBe('accepted');
    await expect(service.deliver(channel)).resolves.toBe('expired');
    expect(fetch).toHaveBeenCalledTimes(5);
    const [tokenUrl, tokenOptions] = fetch.mock.calls[0];
    expect(tokenUrl).toBe(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    );
    expect((tokenOptions?.body as URLSearchParams).get('scope')).toBe(
      'https://wns.windows.com/.default',
    );
    expect(fetch.mock.calls[3][0].toString()).toBe(channel);
    expect(fetch.mock.calls[3][1]).toMatchObject({
      redirect: 'error',
      body: 'nova-inbox',
      headers: { Authorization: 'Bearer renewed', 'X-WNS-Type': 'wns/raw' },
    });
  });

  it('wakes Windows even with Firebase disabled and deactivates only the expired user channel', async () => {
    enable();
    const prisma = {
      notification: { create: jest.fn().mockResolvedValue({ id: 'notice' }) },
      userDeviceToken: {
        findMany: jest.fn().mockResolvedValue([
          { platform: 'android', token: 'firebase-token' },
          { platform: WNS_PLATFORM, token: `wns:${channel}` },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const transport = new WindowsPushService();
    jest.spyOn(transport, 'deliver').mockResolvedValue('expired');
    const service = new NotificationsService(
      prisma as never,
      { getCached: () => ({ fcmEnabled: true }) } as never,
      transport,
    );
    await expect(
      service.createNotification('owner', 'TASK_ASSIGNED', 'Title', 'Body'),
    ).resolves.toEqual({ id: 'notice' });
    expect(transport.deliver).toHaveBeenCalledWith(channel);
    expect(prisma.userDeviceToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'owner',
        platform: WNS_PLATFORM,
        token: { in: [`wns:${channel}`] },
      },
      data: { isActive: false },
    });
    await expect(
      service.saveDeviceToken('other', { token: `wns:${channel}` }),
    ).rejects.toThrow('Use the Windows channel endpoint');
    await service.removeWindowsChannel('owner', channel);
    expect(prisma.userDeviceToken.updateMany).toHaveBeenLastCalledWith({
      where: {
        userId: 'owner',
        platform: WNS_PLATFORM,
        token: `wns:${channel}`,
      },
      data: { isActive: false },
    });
  });

  it('keeps web and mobile Firebase tokens separate from Windows channels', async () => {
    enable();
    const sendEachForMulticast = jest
      .fn()
      .mockResolvedValue({ responses: [{ success: true }, { success: true }] });
    jest
      .mocked(getMessaging)
      .mockReturnValue({ sendEachForMulticast } as never);
    const prisma = {
      notification: { create: jest.fn().mockResolvedValue({ id: 'notice' }) },
      userDeviceToken: {
        findMany: jest.fn().mockResolvedValue([
          { platform: 'web', token: 'web-token' },
          { platform: 'ios', token: 'mobile-token' },
          { platform: WNS_PLATFORM, token: `wns:${channel}` },
        ]),
      },
    };
    const transport = new WindowsPushService();
    jest.spyOn(transport, 'deliver').mockResolvedValue('accepted');
    const service = new NotificationsService(
      prisma as never,
      { getCached: () => ({ fcmEnabled: true }) } as never,
      transport,
    );
    Object.assign(service, { firebaseReady: true });
    await service.createNotification('owner', 'TASK_ASSIGNED', 'Title', 'Body');
    expect(sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['web-token', 'mobile-token'],
        notification: { title: 'Title', body: 'Body' },
      }),
    );
    expect(transport.deliver).toHaveBeenCalledWith(channel);
  });

  it('registers the new channel and revokes the previous channel for the same user', async () => {
    enable();
    const previous = 'https://db5p.notify.windows.com/?token=previous';
    const upsert = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      userDeviceToken: { upsert, updateMany },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const service = new NotificationsService(
      prisma as never,
      {} as never,
      new WindowsPushService(),
    );
    await expect(
      service.registerWindowsChannel('owner', channel, previous),
    ).resolves.toEqual({ registered: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: `wns:${channel}` },
        create: {
          userId: 'owner',
          token: `wns:${channel}`,
          platform: WNS_PLATFORM,
        },
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'owner',
        platform: WNS_PLATFORM,
        token: `wns:${previous}`,
      },
      data: { isActive: false },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.any(Promise),
      expect.any(Promise),
    ]);
  });
});
