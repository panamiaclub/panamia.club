import { defineConfig } from 'vite';
import path from 'node:path';
import { encryptionEnginePlugin } from './scripts/vite-encryption';

export default defineConfig(() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'The unaudited E2EE lab must not be built or served in production.'
    );
  }
  return {
    plugins: [encryptionEnginePlugin()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
        'next/link': path.resolve('node_modules/vinext/dist/shims/link.js'),
        'next/image': path.resolve('node_modules/vinext/dist/shims/image.js'),
        'next/navigation': path.resolve(
          'node_modules/vinext/dist/shims/navigation.js'
        ),
        'next/router': path.resolve('node_modules/vinext/dist/shims/router.js'),
      },
    },
    esbuild: { jsx: 'automatic' as const },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
    root: path.resolve('prototypes/e2ee'),
    server: {
      host: '127.0.0.1',
      port: 3147,
      strictPort: true,
      proxy: {
        '/api/social/encryption': 'http://127.0.0.1:3148',
        '/__e2ee': 'http://127.0.0.1:3148',
      },
      fs: {
        strict: true,
        allow: [
          path.resolve('prototypes/e2ee'),
          path.resolve('lib/e2ee'),
          path.resolve('lib'),
          path.resolve('app/messages'),
          path.resolve('app/globals.css'),
          path.resolve('components'),
          path.resolve('hooks'),
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
