/**
 * Vite's `?url` suffix resolves an import to the emitted asset's public URL
 * instead of its contents. The repo does not pull in `vite/client` types, so
 * the one module form we rely on is declared here.
 */
declare module '*?url' {
  const src: string;
  export default src;
}
