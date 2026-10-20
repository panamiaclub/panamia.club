'use client';

import { useEffect } from 'react';

import { useShopCart } from './cart-provider';

export function ClearShopCart() {
  const { clear } = useShopCart();
  useEffect(() => clear(), [clear]);
  return null;
}
