import { permanentRedirect } from 'next/navigation';

export default async function DonatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      query.append(name, entry);
    }
  }
  permanentRedirect(`/support-pana${query.size ? `?${query}` : ''}`);
}
