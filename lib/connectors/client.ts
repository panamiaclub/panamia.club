'use client';

export async function saveConnectorWork(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    const data: unknown = await response.json();
    if (
      response.ok &&
      data &&
      typeof data === 'object' &&
      'success' in data &&
      data.success === true
    )
      return null;
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof data.error === 'string'
    )
      return data.error;
    return 'That did not save. Try again.';
  } catch {
    return 'Could not reach the server. Try again.';
  }
}
