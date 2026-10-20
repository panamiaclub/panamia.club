export type ShopItemKind = 'merchandise' | 'subscription';

export interface ShopPrice {
  id: string;
  productId: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  kind: ShopItemKind;
  unitAmount: number;
  currency: string;
  recurringInterval: 'month' | 'year' | null;
  recurringIntervalCount: number | null;
  availableQuantity: number | null;
  inStock: boolean;
  isMock?: boolean;
  mockArt?: 'shirt' | 'bracelet' | 'tote' | 'membership' | 'zine' | 'cap';
}

export interface ShopCartItem {
  priceId: string;
  quantity: number;
}
