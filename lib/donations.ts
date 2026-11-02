export type DonationFrequency = 'one-time' | 'monthly';
export type DonationGift = { frequency: DonationFrequency; cents: number };

export const MIN_DONATION_CENTS = 50;
export const MAX_DONATION_CENTS = 99_999_999;
export const DONATION_AMOUNT_ERROR =
  'Enter a USD amount between $0.50 and $999,999.99, with up to two decimal places.';

export const MONTHLY_LEVELS = [
  {
    name: 'dePana',
    amount: 10,
    description:
      'A little love, every month. Help keep local connection growing.',
  },
  {
    name: 'Pana Confiado',
    amount: 15,
    description:
      'Someone we can count on. Give community-led ideas room to grow.',
  },
  {
    name: 'Pana Real',
    amount: 25,
    description: 'All in for local. Help sustain the tools and work behind it.',
  },
] as const;

export const ONE_TIME_AMOUNTS = [25, 40, 100, 250, 500, 1000, 2500] as const;

export const DONATION_PURPOSES = [
  { label: 'Where it is needed most', value: '' },
  { label: 'Community directory', value: 'Directory' },
  { label: 'Other (describe in your note)', value: 'Other' },
] as const;

export function isDonationAmount(cents: unknown): cents is number {
  return (
    typeof cents === 'number' &&
    Number.isSafeInteger(cents) &&
    cents >= MIN_DONATION_CENTS &&
    cents <= MAX_DONATION_CENTS
  );
}

export function formatGift(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function parseCustomAmount(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;

  const [dollars, fraction = ''] = value.split('.');
  // Parse cents directly rather than rounding a donor's input.
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  return isDonationAmount(cents) ? cents : null;
}

export function getMonthlyDonationTier(
  cents: number,
  recurring: boolean
): number {
  if (!recurring) return 0;
  for (let index = MONTHLY_LEVELS.length - 1; index >= 0; index--) {
    if (cents >= MONTHLY_LEVELS[index].amount * 100) return index + 1;
  }
  return 0;
}

export function parseDonationReturn(
  params: Record<string, string | string[] | undefined>
): DonationGift | null {
  if (params.canceled !== '1') return null;
  const { frequency, amount } = params;
  if (
    (frequency !== 'one-time' && frequency !== 'monthly') ||
    typeof amount !== 'string' ||
    !/^\d+$/.test(amount)
  ) {
    return null;
  }
  const cents = Number(amount);
  return isDonationAmount(cents) ? { frequency, cents } : null;
}
