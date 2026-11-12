declare module 'virtual:pana-openmls' {
  export const engineAvailable: boolean;
  export const MlsDevice: typeof import('../crypto/openmls/pkg/pana_openmls.js').MlsDevice;
  export const ProfileSigningKey: typeof import('../crypto/openmls/pkg/pana_openmls.js').ProfileSigningKey;
  const initialize: typeof import('../crypto/openmls/pkg/pana_openmls.js').default;
  export default initialize;
}
