import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig(() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'The unaudited E2EE lab must not be built or served in production.'
    );
  }
  return {
    root: path.resolve('prototypes/e2ee'),
    server: {
      host: '127.0.0.1',
      port: 3147,
      strictPort: true,
      fs: {
        strict: true,
        allow: [
          path.resolve('prototypes/e2ee'),
          path.resolve('lib/e2ee'),
          path.resolve('crypto/openmls/pkg'),
          path.resolve('node_modules'),
        ],
        deny: [
          '.env',
          '.env.*',
          '.dev.vars',
          '.dev.vars.*',
          '*.{crt,pem}',
          '**/.git/**',
        ],
      },
    },
  };
});
