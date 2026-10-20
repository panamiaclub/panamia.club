import type { ReactNode } from 'react';

import { ShopCartProvider } from '@/components/shop/cart-provider';
import { ShopNav } from '@/components/shop/shop-nav';

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <ShopCartProvider>
      <div className="bg-pana-cream min-h-screen">
        <ShopNav />
        {children}
      </div>
    </ShopCartProvider>
  );
}
