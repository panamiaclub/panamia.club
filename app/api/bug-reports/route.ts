import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { deleteFile, uploadFile } from '@/lib/blob/api';
import { contactSubmissions, users } from '@/lib/schema';
import { verifyTurnstile } from '@/lib/turnstile';
import { sendTemplateEmail } from '@/lib/email';
import { notifyStaffOfContactSubmission } from '@/lib/server/contact-notify';
import { CONTACT_CATEGORY_LABELS } from '@/lib/contact-categories';

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
      { error: 'The bug report could not be read.' },
      { status: 400 }
    );
  }

  const name = textField(form, 'name');
  const email = textField(form, 'email').toLowerCase();
  const message = textField(form, 'message');
  const pageUrl = safePageUrl(textField(form, 'pageUrl'));
  const viewport = textField(form, 'viewport').slice(0, 100) || null;
  const locale = textField(form, 'locale').slice(0, 50);
  const turnstileToken = textField(form, 'turnstileToken');

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
        message,
        category: 'technical',
        userId,
        screenname,
        pageUrl,
        screenshotUrl,
        userAgent: userAgentParts.join('\n'),
        viewport,
      })
      .returning({ id: contactSubmissions.id });
    submissionId = inserted.id;
  } catch (error) {
    if (screenshotUrl) await deleteFile(screenshotUrl);
    console.error('Database error saving bug report:', error);
    return NextResponse.json(
      { error: 'The report could not be saved. Please try again later.' },
      { status: 500 }
    );
  }

  sendTemplateEmail(
    'contact.received',
    {
      name,
      category: CONTACT_CATEGORY_LABELS.technical,
      message,
    },
    email
  ).catch((error) => console.error('Bug report receipt email error:', error));

  notifyStaffOfContactSubmission({
    id: submissionId,
    name,
    email,
    category: 'technical',
    screenname,
    isAuthenticated: userId !== null,
  }).catch((error) =>
    console.error('Bug report staff notification error:', error)
  );

  return NextResponse.json({
    success: true,
    message: 'Thanks — your bug report has been sent.',
  });
}
