import { GhlClient } from '@/lib/ghl';

export async function syncShopBuyerToGhl(input: {
  email: string;
  name?: string | null;
  subscription: boolean;
}): Promise<void> {
  const client = GhlClient.create();
  if (!client) return;

  const [firstName, ...lastParts] = (input.name ?? '').trim().split(/\s+/);
  const { contact } = await client.upsertContact({
    email: input.email,
    ...(firstName && { firstName }),
    ...(lastParts.length > 0 && { lastName: lastParts.join(' ') }),
  });
  await client.addTags(contact.id, [
    'panamia-shop-customer',
    ...(input.subscription ? ['panamia-shop-subscriber'] : []),
  ]);
}
