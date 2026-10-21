import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { commerceShopSettings } from '@/lib/schema';

export const DEFAULT_SHOP_SETTINGS = {
  id: 'default',
  standardShippingEnabled: true,
  standardShippingCents: 500,
  standardShippingMinDays: 3,
  standardShippingMaxDays: 7,
  localPickupEnabled: true,
  pickupInstructions: null,
  ghlSyncEnabled: true,
  customerEmailEnabled: true,
  staffEmailEnabled: true,
};

export async function getShopSettings() {
  const settings = await db.query.commerceShopSettings.findFirst({
    where: eq(commerceShopSettings.id, 'default'),
  });
  return settings ?? DEFAULT_SHOP_SETTINGS;
}
