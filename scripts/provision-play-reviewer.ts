import { parseArgs } from 'node:util';
import {
  PlayReviewerProvisioningError,
  provisionPlayReviewer,
} from '../lib/server/play-reviewer';
import { PLAY_REVIEW_EMAIL } from '../lib/play-reviewer';

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    rotate: { type: 'boolean', default: false },
  },
});

async function main() {
  if (!values.apply) {
    throw new PlayReviewerProvisioningError(
      'Explicit --apply is required to provision the review account.'
    );
  }
  if (!process.env.POSTGRES_URL || !process.env.PLAY_REVIEW_PASSWORD) {
    throw new PlayReviewerProvisioningError(
      'POSTGRES_URL and PLAY_REVIEW_PASSWORD must be supplied securely.'
    );
  }
  const result = await provisionPlayReviewer(
    process.env.PLAY_REVIEW_PASSWORD,
    values.rotate
  );
  console.log(
    `${result.created ? 'Created' : 'Rotated password for'} ${PLAY_REVIEW_EMAIL}; no staff roles were granted.`
  );
}

main().then(
  () => process.exit(0),
  (failure: unknown) => {
    // Driver errors can include SQL parameters. Do not print a credential
    // hash or database connection information into a maintenance run log.
    if (failure instanceof PlayReviewerProvisioningError) {
      console.error(`Review account provisioning failed: ${failure.message}`);
    } else {
      console.error(
        'Unexpected review-account database or hashing failure; no successful provisioning was confirmed.',
        { errorType: failure instanceof Error ? failure.name : typeof failure }
      );
    }
    process.exit(1);
  }
);
