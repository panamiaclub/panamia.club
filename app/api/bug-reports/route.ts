import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveProfileWithActor } from '@/lib/server/active-profile';
import { db } from '@/lib/db';
import { deleteFile, uploadFile } from '@/lib/blob/api';
import { contactSubmissions, users } from '@/lib/schema';
import { verifyTurnstile } from '@/lib/turnstile';
import { sendTemplateEmail } from '@/lib/email';
import { notifyStaffOfContactSubmission } from '@/lib/server/contact-notify';
import { CONTACT_CATEGORY_LABELS } from '@/lib/contact-categories';
import {
  isSafetyReportReason,
  isSafetyReportTargetType,
  SAFETY_REPORT_REASONS,
  SAFETY_REPORT_TARGETS,
  safetyReportUrl,
  encryptedReportDisclosureSchema,
} from '@/lib/safety-report';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const SCREENSHOT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function validEmail(email: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email);
}

function safePageUrl(value: string): string | null {
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'The report could not be read.' },
      { status: 400 }
    );
  }

  const reportType = form.get('reportType') ?? 'bug';
  if (reportType !== 'bug' && reportType !== 'safety') {
    return NextResponse.json(
      { error: 'Choose a valid report type.' },
      { status: 400 }
    );
  }
  const isSafetyReport = reportType === 'safety';
  const encodedDisclosure = form.get('encryptedDisclosure');
  let disclosure: ReturnType<
    typeof encryptedReportDisclosureSchema.parse
  > | null = null;
  if (encodedDisclosure !== null) {
    if (
      !isSafetyReport ||
      typeof encodedDisclosure !== 'string' ||
      encodedDisclosure.length > 35_000
    )
      return NextResponse.json(
        { error: 'Invalid encrypted-message disclosure.' },
        { status: 400 }
      );
    let value: unknown;
    try {
      value = JSON.parse(encodedDisclosure);
    } catch {
      return NextResponse.json(
        { error: 'Invalid encrypted-message disclosure.' },
        { status: 400 }
      );
    }
    const parsed = encryptedReportDisclosureSchema.safeParse(value);
    if (!parsed.success)
      return NextResponse.json(
        {
          error: 'A single bounded excerpt and explicit consent are required.',
        },
        { status: 400 }
      );
    disclosure = parsed.data;
  }
  if (
    isSafetyReport &&
    (request.headers.get('sec-fetch-site') === 'cross-site' ||
      (request.headers.has('origin') &&
        request.headers.get('origin') !== new URL(request.url).origin))
  ) {
    return NextResponse.json(
      { error: 'Send the report from the Pana Mia app or website.' },
      { status: 403 }
    );
  }

  const name = textField(form, 'name');
  const email = textField(form, 'email').toLowerCase();
  const message = textField(form, 'message');
  const pageUrl = isSafetyReport
    ? safetyReportUrl(textField(form, 'pageUrl'))
    : safePageUrl(textField(form, 'pageUrl'));
  const viewport = textField(form, 'viewport').slice(0, 100) || null;
  const locale = textField(form, 'locale').slice(0, 50);
  const turnstileToken = textField(form, 'turnstileToken');
  const targetType = textField(form, 'targetType');
  const targetUrl = safetyReportUrl(textField(form, 'targetUrl'));
  const reason = textField(form, 'reason');
  let storedMessage = message;

  if (isSafetyReport) {
    if (
      !isSafetyReportTargetType(targetType) ||
      !targetUrl ||
      !isSafetyReportReason(reason)
    ) {
      return NextResponse.json(
        {
          error:
            'Choose a safety reason and provide a valid user or content URL.',
        },
        { status: 400 }
      );
    }
    if ([...form.values()].some((value) => value instanceof File)) {
      return NextResponse.json(
        {
          error:
            'Safety reports do not accept attachments. Send a link and description instead.',
        },
        { status: 400 }
      );
    }
    storedMessage = [
      'Safety report',
      `Reason: ${SAFETY_REPORT_REASONS[reason]}`,
      `Report about: ${SAFETY_REPORT_TARGETS[targetType]}`,
      `Reported URL: ${targetUrl}`,
      '',
      message,
    ].join('\n');
  }

  if (name.length < 2 || name.length > 75) {
    return NextResponse.json(
      { error: 'Please enter a valid name.' },
      { status: 400 }
    );
  }
  if (!validEmail(email) || email.length > 100) {
    return NextResponse.json(
      { error: 'Please enter a valid email address.' },
      { status: 400 }
    );
  }
  if (message.length < 10 || message.length > 3000) {
    return NextResponse.json(
      { error: 'Describe the problem in 10 to 3,000 characters.' },
      { status: 400 }
    );
  }
  if (!pageUrl) {
    return NextResponse.json(
      { error: 'The page address is missing or invalid.' },
      { status: 400 }
    );
  }
  if (!turnstileToken || !(await verifyTurnstile(turnstileToken))) {
    return NextResponse.json(
      { error: 'Verification failed. Please try again.' },
      { status: 400 }
    );
  }

  const screenshotValue = form.get('screenshot');
  const screenshot =
    screenshotValue instanceof File && screenshotValue.size > 0
      ? screenshotValue
      : null;
  if (screenshot) {
    if (
      screenshot.size > MAX_SCREENSHOT_BYTES ||
      !SCREENSHOT_TYPES.has(screenshot.type)
    ) {
      return NextResponse.json(
        {
          error:
            'Screenshots must be PNG, JPEG, or WebP and no larger than 5 MB.',
        },
        { status: 400 }
      );
    }
  }

  const session = await auth();
  let userId: string | null = null;
  let screenname: string | null = null;
  if (session?.user?.id) {
    userId = session.user.id;
    const account = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { screenname: true },
    });
    screenname = account?.screenname ?? null;
  }
  if (disclosure) {
    if (!userId || targetType !== 'content')
      return NextResponse.json(
        {
          error:
            'Sign in and select a content report to disclose an encrypted-message excerpt.',
        },
        { status: 403 }
      );
    const profile = await getActiveProfileWithActor(userId);
    if (
      !profile ||
      profile.id !== disclosure.profileId ||
      profile.socialActor?.id !== disclosure.actorId
    )
      return NextResponse.json(
        {
          error:
            'The reporting profile changed. Open the selected message again.',
        },
        { status: 409 }
      );
    storedMessage += [
      '',
      'User-consented encrypted-message excerpt (an unverified quotation, not server-decrypted content):',
      `Room: ${disclosure.roomId}`,
      `Message: ${disclosure.eventId}`,
      `Reporting profile: ${disclosure.profileId}`,
      '',
      disclosure.quote,
    ].join('\n');
  }

  let screenshotUrl: string | null = null;
  if (screenshot) {
    const extension = SCREENSHOT_TYPES.get(screenshot.type);
    const now = new Date();
    const key = [
      'bug-reports',
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${createId()}.${extension}`,
    ].join('/');
    screenshotUrl = await uploadFile(
      key,
      Buffer.from(await screenshot.arrayBuffer())
    );
    if (!screenshotUrl) {
      return NextResponse.json(
        { error: 'The screenshot could not be uploaded. Please try again.' },
        { status: 500 }
      );
    }
  }

  const userAgentParts = [
    request.headers.get('user-agent')?.slice(0, 1000) || 'Unknown browser',
    locale ? `Language: ${locale}` : '',
  ].filter(Boolean);

  let submissionId: string;
  try {
    const [inserted] = await db
      .insert(contactSubmissions)
      .values({
        name,
        email,
        message: storedMessage,
        category: isSafetyReport ? 'safety' : 'technical',
        userId,
        screenname,
        pageUrl,
        screenshotUrl,
        userAgent: isSafetyReport ? null : userAgentParts.join('\n'),
        viewport: isSafetyReport ? null : viewport,
      })
      .returning({ id: contactSubmissions.id });
    submissionId = inserted.id;
  } catch (error) {
    if (screenshotUrl) await deleteFile(screenshotUrl);
    console.error(
      'Database error saving report:',
      isSafetyReport
        ? { name: error instanceof Error ? error.name : 'UnknownError' }
        : error
    );
    return NextResponse.json(
      { error: 'The report could not be saved. Please try again later.' },
      { status: 500 }
    );
  }

  const category = isSafetyReport ? 'safety' : 'technical';
  const receipt = sendTemplateEmail(
    'contact.received',
    {
      name,
      category: CONTACT_CATEGORY_LABELS[category],
      message: isSafetyReport
        ? `Your safety report was received for review. Reference: ${submissionId}. Do not send suspected child sexual abuse material.`
        : message,
    },
    email
  ).catch((error) => console.error('Report receipt email error:', error));

  const staffNotification = notifyStaffOfContactSubmission({
    id: submissionId,
    name,
    email,
    category,
    screenname,
    isAuthenticated: userId !== null,
  }).catch((error) => console.error('Report staff notification error:', error));

  if (isSafetyReport) await Promise.all([receipt, staffNotification]);

  return NextResponse.json({
    success: true,
    message: isSafetyReport
      ? 'Your safety report has been received for review.'
      : 'Thanks — your bug report has been sent.',
  });
}
