import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { contactSubmissions, users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { verifyTurnstile } from '@/lib/turnstile';
import {
  isContactCategory,
  CONTACT_CATEGORY_LABELS,
} from '@/lib/contact-categories';
import { sendTemplateEmail } from '@/lib/email';
import { notifyStaffOfContactSubmission } from '@/lib/server/contact-notify';

const validateEmail = (email: string): boolean => {
  const regEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  return regEx.test(email);
};

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Get and validate body variables
  const { name, email, message, category, turnstileToken } = body;

  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json(
      { error: 'Please enter a valid name (at least 2 characters).' },
      { status: 400 }
    );
  }

  if (!validateEmail(email)) {
    return NextResponse.json(
      { error: 'Please enter a valid email address.' },
      { status: 400 }
    );
  }

  if (!message || typeof message !== 'string' || message.trim().length < 10) {
    return NextResponse.json(
      { error: 'Please enter a message (at least 10 characters).' },
      { status: 400 }
    );
  }

  if (!isContactCategory(category)) {
    return NextResponse.json(
      { error: 'Please choose what your message is about.' },
      { status: 400 }
    );
  }

  const isSafetyReport = category === 'safety';
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

  // Turnstile is required for everyone, signed in or not — the widget is shown
  // unconditionally on the form. A session cookie is not a bot check, and
  // gating on it meant the only submissions that skipped verification were the
  // ones from accounts a spammer had already created.
  if (!turnstileToken) {
    return NextResponse.json(
      { error: 'Verification required.' },
      { status: 400 }
    );
  }

  const isValid = await verifyTurnstile(turnstileToken);
  if (!isValid) {
    return NextResponse.json(
      {
        error: 'Verification failed. Please try again or contact us in-person.',
      },
      { status: 400 }
    );
  }

  // When the sender is signed in, record which account it was. Taken from the
  // session rather than the request body so it can't be spoofed; the screenname
  // is snapshotted here so a later rename doesn't rewrite the support history.
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

  // Save to database. The row ID comes back because the staff notification
  // carries it — the notification is a pointer into the admin queue, not a copy
  // of the message, so without the ID there is nothing to point at.
  const cleanName = name.trim();
  const cleanEmail = email.toLowerCase().trim();
  let submissionId: string;
  try {
    const [inserted] = await db
      .insert(contactSubmissions)
      .values({
        name: cleanName,
        email: cleanEmail,
        message: message.trim(),
        category,
        userId,
        screenname,
      })
      .returning({ id: contactSubmissions.id });
    submissionId = inserted.id;
  } catch (error) {
    console.error(
      'Database error saving contact form:',
      isSafetyReport
        ? { name: error instanceof Error ? error.name : 'UnknownError' }
        : error
    );
    return NextResponse.json(
      {
        error:
          'There was an error saving your message. Please try again later.',
      },
      { status: 500 }
    );
  }

  // Safety receipts deliberately exclude sensitive reported content.
  const receipt = sendTemplateEmail(
    'contact.received',
    {
      name: cleanName,
      category: CONTACT_CATEGORY_LABELS[category],
      message: isSafetyReport
        ? `Your safety report was received for review. Reference: ${submissionId}. Do not send suspected child sexual abuse material.`
        : message.trim(),
    },
    cleanEmail
  ).catch((err) => console.error('Contact receipt email error:', err));

  const staffNotification = notifyStaffOfContactSubmission({
    id: submissionId,
    name: cleanName,
    email: cleanEmail,
    category,
    screenname,
    isAuthenticated: userId !== null,
  }).catch((err) => console.error('Contact staff notification error:', err));

  if (isSafetyReport) await Promise.all([receipt, staffNotification]);

  return NextResponse.json(
    {
      msg: 'Your message has been received. We will get back to you soon!',
    },
    { status: 200 }
  );
}
