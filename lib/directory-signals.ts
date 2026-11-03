import type { ViewerSignalStates } from '@/lib/server/profile-signals';

export const DIRECTORY_SIGNAL_BATCH_SIZE = 60;

export async function fetchDirectorySignalStates(
  profileIds: readonly string[],
  signal?: AbortSignal
): Promise<ViewerSignalStates> {
  const ids = [...new Set(profileIds)];
  const batches: string[][] = [];
  for (
    let start = 0;
    start < Math.max(ids.length, 1);
    start += DIRECTORY_SIGNAL_BATCH_SIZE
  ) {
    batches.push(ids.slice(start, start + DIRECTORY_SIGNAL_BATCH_SIZE));
  }

  const fetchBatch = async (batch: string[]): Promise<ViewerSignalStates> => {
    const response = await fetch(
      `/api/listings/signals?ids=${encodeURIComponent(batch.join(','))}`,
      { signal, cache: 'no-store' }
    );
    if (!response.ok) {
      throw new Error(`Saved listing lookup returned HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as {
      success: boolean;
      data?: ViewerSignalStates;
    };
    const data = payload?.data;
    if (
      payload?.success !== true ||
      typeof data?.maySignal !== 'boolean' ||
      !data.listings ||
      typeof data.listings !== 'object' ||
      Array.isArray(data.listings)
    ) {
      throw new Error('Saved listing lookup returned an invalid response.');
    }
    return data;
  };

  const states: ViewerSignalStates[] = [];
  for (let start = 0; start < batches.length; start += 4) {
    states.push(
      ...(await Promise.all(batches.slice(start, start + 4).map(fetchBatch)))
    );
  }
  const maySignal = states[0].maySignal;
  if (states.some((state) => state.maySignal !== maySignal)) {
    throw new Error('Directory viewer changed while loading saved listings.');
  }
  return {
    maySignal,
    listings: Object.fromEntries(
      states.flatMap((state) => Object.entries(state.listings))
    ),
  };
}
