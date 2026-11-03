import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { renderTemplate, type TemplateId } from '../lib/email-templates';

const [outputDirectory, ...extra] = process.argv.slice(2);
if (!outputDirectory || extra.length) {
  throw new Error(
    'Usage: yarn tsx scripts\\preview-listing-emails.ts <private-output-directory>'
  );
}

const directory = resolve(outputDirectory);
const refreshFixture = {
  businessName: 'Sample Neighborhood Studio',
  reviewUrl:
    'https://preview.invalid/listings/invite?id=preview-business#token=not-a-real-token',
  stopUrl:
    'https://preview.invalid/listings/reminders/stop?cycleId=preview-cycle#token=not-a-real-token',
  deadline: '2026-12-03',
  deliveryId: 'preview-reference',
};
const previews: {
  file: string;
  template: TemplateId;
  params: Record<string, unknown>;
}[] = [
  {
    file: 'listing-refresh-initial',
    template: 'listing.refresh',
    params: refreshFixture,
  },
  {
    file: 'listing-refresh-reminder',
    template: 'listing.refresh',
    params: { ...refreshFixture, reminderNotice: true },
  },
  {
    file: 'listing-refresh-final',
    template: 'listing.refresh',
    params: { ...refreshFixture, reminderNotice: true, finalNotice: true },
  },
  {
    file: 'listing-refresh-owned',
    template: 'listing.refresh',
    params: {
      ...refreshFixture,
      reviewUrl: 'https://preview.invalid/listings/review?id=preview-business',
    },
  },
  {
    file: 'listing-claim',
    template: 'listing.claim',
    params: {
      businessName: refreshFixture.businessName,
      requesterEmail: 'manager@example.invalid',
      claimUrl:
        'https://preview.invalid/listings/claim?token=not-a-real-token&id=preview-business',
    },
  },
  {
    file: 'listing-setup',
    template: 'listing.setup',
    params: {
      businessName: refreshFixture.businessName,
      signInUrl:
        'https://preview.invalid/api/auth/magic-link/verify?token=not-a-real-token&callbackURL=%2Flistings%2Fsetup%3Fid%3Dpreview-business',
      setupUrl: 'https://preview.invalid/listings/setup?id=preview-business',
    },
  },
];

await mkdir(directory, { recursive: true });
const manifest = [];
for (const preview of previews) {
  const rendered = renderTemplate(preview.template, preview.params);
  await writeFile(join(directory, `${preview.file}.html`), rendered.html);
  await writeFile(join(directory, `${preview.file}.txt`), rendered.text);
  manifest.push({
    template: preview.template,
    subject: rendered.subject,
    html: `${preview.file}.html`,
    text: `${preview.file}.txt`,
  });
}
await writeFile(
  join(directory, 'manifest.json'),
  JSON.stringify(
    {
      fixtureOnly: true,
      note: 'Registered template output only. No sends, recipients or valid invitation tokens. All action URLs use preview.invalid.',
      previews: manifest,
    },
    null,
    2
  )
);
console.log(
  `Generated ${previews.length} fixture-only listing emails in ${directory}`
);
