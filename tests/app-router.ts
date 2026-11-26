import type { AppRouterInstance } from 'vinext/shims/internal/app-router-context';

function unexpectedNavigation(): never {
  throw new Error('Static component rendering must not navigate.');
}

export const appRouterInstance: AppRouterInstance = {
  bfcacheId: 'static-component-test',
  back: unexpectedNavigation,
  forward: unexpectedNavigation,
  refresh: unexpectedNavigation,
  push: unexpectedNavigation,
  replace: unexpectedNavigation,
  prefetch: unexpectedNavigation,
};
