import type { Page } from '@playwright/test';

export async function nativeBridge(
  page: Page,
  options: {
    platform?: 'android' | 'ios';
    googlePlugin?: boolean;
    cancelGoogle?: boolean;
    launchUrl?: string;
  } = {}
) {
  await page.addInitScript((config) => {
    const callbacks: Record<string, (data: unknown) => void> = {};
    const record = (plugin: string, method: string, args: unknown) => {
      const recorded = JSON.parse(
        sessionStorage.getItem('native-auth-test.calls') ?? '[]'
      );
      recorded.push({ plugin, method, args });
      sessionStorage.setItem(
        'native-auth-test.calls',
        JSON.stringify(recorded)
      );
    };
    const headers = [
      {
        name: 'App',
        methods: [
          { name: 'getLaunchUrl', rtype: 'promise' },
          { name: 'exitApp', rtype: 'promise' },
          { name: 'addListener', rtype: 'callback' },
          { name: 'removeListener', rtype: 'callback' },
        ],
      },
      {
        name: 'SplashScreen',
        methods: [{ name: 'hide', rtype: 'promise' }],
      },
      ...(config.googlePlugin === false
        ? []
        : [
            {
              name: 'SocialLogin',
              methods: [
                { name: 'initialize', rtype: 'promise' },
                { name: 'login', rtype: 'promise' },
              ],
            },
          ]),
    ];
    Object.assign(window, {
      CapacitorCustomPlatform: { name: config.platform ?? 'android' },
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => config.platform ?? 'android',
        isPluginAvailable: (name: string) =>
          headers.some((header) => header.name === name),
        PluginHeaders: headers,
        nativePromise: async (
          plugin: string,
          method: string,
          args: unknown
        ) => {
          record(plugin, method, args);
          if (plugin === 'SocialLogin' && method === 'login') {
            if (config.cancelGoogle) {
              throw Object.assign(new Error('Cancelled'), {
                code: 'USER_CANCELLED',
              });
            }
            return {
              provider: 'google',
              result: {
                responseType: 'online',
                idToken: 'native-google-test-id-token',
                accessToken: null,
              },
            };
          }
          if (plugin === 'App' && method === 'getLaunchUrl') {
            return config.launchUrl ? { url: config.launchUrl } : {};
          }
          return {};
        },
        nativeCallback: (
          plugin: string,
          method: string,
          args: { eventName: string },
          callback: (data: unknown) => void
        ) => {
          record(plugin, method, args);
          if (method === 'addListener') callbacks[args.eventName] = callback;
          if (method === 'removeListener') delete callbacks[args.eventName];
          return args.eventName;
        },
      },
    });
    window.addEventListener('native-auth-test.app-url', (event) => {
      if (event instanceof CustomEvent) {
        callbacks.appUrlOpen?.({ url: event.detail });
      }
    });
    window.addEventListener('native-auth-test.back', (event) => {
      if (event instanceof CustomEvent) {
        callbacks.backButton?.({ canGoBack: event.detail });
      }
    });
  }, options);
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: null })
  );
}

export function calls(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem('native-auth-test.calls') ?? '[]') as {
        plugin: string;
        method: string;
        args: {
          eventName?: string;
          google?: { webClientId: string; mode: string };
          options?: { nonce: string; scopes: string[] };
        };
      }[]
  );
}
