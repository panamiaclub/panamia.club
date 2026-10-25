async function getReferralLink(): Promise<string> {
  const response = await fetch('/api/referrals/me', { method: 'POST' });
  if (!response.ok) {
    throw new Error('Could not get your referral link.');
  }

  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('referralUrl' in body) ||
    typeof body.referralUrl !== 'string' ||
    !body.referralUrl.trim()
  ) {
    throw new Error('No referral link was returned.');
  }

  return body.referralUrl;
}

export async function copyReferralLink(): Promise<void> {
  const clipboard = navigator.clipboard;
  if (!clipboard) {
    throw new Error('Clipboard is not available.');
  }

  if (
    typeof ClipboardItem !== 'undefined' &&
    typeof clipboard.write === 'function'
  ) {
    const text = getReferralLink().then(
      (url) => new Blob([url], { type: 'text/plain' })
    );

    // Safari needs the write to start during the click, before the fetch finishes.
    await Promise.all([
      text,
      clipboard.write([new ClipboardItem({ 'text/plain': text })]),
    ]);
  } else {
    await clipboard.writeText(await getReferralLink());
  }
}
