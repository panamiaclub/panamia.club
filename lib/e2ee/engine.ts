import type {
  MlsDevice,
  ProfileSigningKey,
} from '../../crypto/openmls/pkg/pana_openmls.js';
export type NativeDevice = MlsDevice;
export type NativeProfileKey = ProfileSigningKey;
export type ChatEngine = {
  MlsDevice: typeof import('../../crypto/openmls/pkg/pana_openmls.js').MlsDevice;
  ProfileSigningKey: typeof import('../../crypto/openmls/pkg/pana_openmls.js').ProfileSigningKey;
};
let initialization: Promise<ChatEngine> | undefined;

export function loadChatEngine(): Promise<ChatEngine> {
  initialization ??= (async () => {
    const engine = await import('virtual:pana-openmls');
    if (!engine.engineAvailable)
      throw new Error(
        'This client does not include the encryption engine. Update it before using encrypted conversations.'
      );
    await engine.default();
    return engine;
  })();
  return initialization;
}

export function engineCall<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw new Error(
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : 'The encryption engine failed.',
      { cause: error }
    );
  }
}
