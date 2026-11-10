export const PLAY_REVIEW_EMAIL = 'play-review@panamia.club';
export const PLAY_REVIEW_SCREENNAME = 'play-review';
export const PLAY_REVIEW_NAME = 'Pana Mia App Review';

export function isPlayReviewerEmail(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.trim().toLowerCase() === PLAY_REVIEW_EMAIL
  );
}
