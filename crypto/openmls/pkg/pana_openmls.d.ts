/* tslint:disable */

/**
 * Client-only state. It must not be instantiated by a server message handler.
 */
export class MlsDevice {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Call only after the delivery service confirms this exact pending commit.
   */
  acknowledgeCommit(room: string): void;
  addMember(room: string, _package: Uint8Array | number[]): string;
  /**
   * Application identity approval is deliberately separate from MLS parsing.
   * P1 callers use synthetic pinned identities; P2 supplies verified credentials.
   */
  approveIdentity(identity: string, public_key: Uint8Array | number[]): void;
  createRoom(room: string): void;
  static describeKeyPackage(bytes: Uint8Array | number[]): string;
  deviceIdentity(): string;
  /**
   * Only after explicit rejection of this attempt, never on a network timeout.
   */
  discardRejectedCommit(room: string): void;
  /**
   * Only after an explicit leave or a verified newer Welcome. The caller
   * preserves retained history separately and never rolls this ratchet back.
   */
  discardRoom(room: string, expected_epoch: string): void;
  encryptMessage(room: string, content: Uint8Array | number[]): Uint8Array;
  joinRoom(room: string, welcome: Uint8Array | number[]): void;
  keyPackage(): Uint8Array;
  constructor(identity: string);
  processMessage(room: string, frame: Uint8Array | number[]): string;
  publicKey(): Uint8Array;
  removeMember(room: string, identity: string): string;
  /**
   * Only call after authenticated local unwrapping and profile-context checks.
   */
  static restoreLocal(bytes: Uint8Array | number[]): MlsDevice;
  roomInfo(room: string): string;
  signStatement(purpose: string, payload: Uint8Array | number[]): Uint8Array;
  /**
   * Raw local secrets, never a cloud-backup or delivery format. The caller
   * must atomically encrypt these bytes with its device-local wrapping key.
   */
  snapshotLocal(): Uint8Array;
}

/**
 * Separate profile authorization key. Never reuse an ActivityPub or live MLS
 * ratchet as recovery material.
 */
export class ProfileSigningKey {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Portable Ed25519 seed || public key, only for authenticated local
   * wrapping or a user-key-protected identity backup; never a server field.
   */
  exportSecret(): Uint8Array;
  constructor();
  publicKey(): Uint8Array;
  static restoreSecret(bytes: Uint8Array | number[]): ProfileSigningKey;
  signStatement(purpose: string, payload: Uint8Array | number[]): Uint8Array;
  static verifyStatement(
    purpose: string,
    payload: Uint8Array | number[],
    public_key: Uint8Array | number[],
    signature: Uint8Array | number[]
  ): boolean;
}

export type InitInput =
  RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_mlsdevice_free: (a: number, b: number) => void;
  readonly __wbg_profilesigningkey_free: (a: number, b: number) => void;
  readonly mlsdevice_acknowledgeCommit: (
    a: number,
    b: number,
    c: number
  ) => [number, number];
  readonly mlsdevice_addMember: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number, number];
  readonly mlsdevice_approveIdentity: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number];
  readonly mlsdevice_createRoom: (
    a: number,
    b: number,
    c: number
  ) => [number, number];
  readonly mlsdevice_describeKeyPackage: (
    a: number,
    b: number
  ) => [number, number, number, number];
  readonly mlsdevice_deviceIdentity: (a: number) => [number, number];
  readonly mlsdevice_discardRejectedCommit: (
    a: number,
    b: number,
    c: number
  ) => [number, number];
  readonly mlsdevice_discardRoom: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number];
  readonly mlsdevice_encryptMessage: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number, number];
  readonly mlsdevice_joinRoom: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number];
  readonly mlsdevice_keyPackage: (
    a: number
  ) => [number, number, number, number];
  readonly mlsdevice_new: (a: number, b: number) => [number, number, number];
  readonly mlsdevice_processMessage: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number, number];
  readonly mlsdevice_publicKey: (a: number) => [number, number];
  readonly mlsdevice_removeMember: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number, number];
  readonly mlsdevice_restoreLocal: (
    a: number,
    b: number
  ) => [number, number, number];
  readonly mlsdevice_roomInfo: (
    a: number,
    b: number,
    c: number
  ) => [number, number, number, number];
  readonly mlsdevice_signStatement: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number, number];
  readonly mlsdevice_snapshotLocal: (
    a: number
  ) => [number, number, number, number];
  readonly profilesigningkey_exportSecret: (a: number) => [number, number];
  readonly profilesigningkey_new: () => [number, number, number];
  readonly profilesigningkey_publicKey: (a: number) => [number, number];
  readonly profilesigningkey_restoreSecret: (
    a: number,
    b: number
  ) => [number, number, number];
  readonly profilesigningkey_signStatement: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number
  ) => [number, number, number, number];
  readonly profilesigningkey_verifyStatement: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number
  ) => [number, number, number];
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (
    a: number,
    b: number,
    c: number,
    d: number
  ) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(
  module: { module: SyncInitInput } | SyncInitInput
): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
  module_or_path?:
    | { module_or_path: InitInput | Promise<InitInput> }
    | InitInput
    | Promise<InitInput>
): Promise<InitOutput>;
