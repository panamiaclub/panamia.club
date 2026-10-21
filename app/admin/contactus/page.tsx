'use client';

import { useSession } from '@/lib/auth-client';
import { useAdminGate } from '@/components/Admin/gate';
import { AdminPageHeader } from '@/components/Admin/parts';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import PageMeta from '@/components/PageMeta';
import { standardizeDateTime } from '@/lib/standardized';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_LABELS,
  type ContactCategory,
} from '@/lib/contact-categories';

interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  message: string | null;
  category: ContactCategory;
  status: 'open' | 'actioned' | 'dismissed';
  moderationReason: string | null;
  lastModerationActionAt: string | null;
  // Set only when the sender was signed in — the account and a snapshot of the
  // screenname it had at submit time.
  userId: string | null;
  screenname: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page_number: number;
  total_pages: number;
}

const statusBadge: Record<ContactSubmission['status'], string> = {
  open: 'bg-yellow-100 text-yellow-800',
  actioned: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-500',
};

export default function AdminContactUsPage() {
  const { data: session } = useSession();
  const { gate } = useAdminGate();
  const [page_number, setPageNumber] = useState(1);
  const [category, setCategory] = useState<ContactCategory | ''>('');
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [pagination, setPagination] = useState({} as Pagination);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Per-submission notes recorded alongside an actioned/dismissed decision.
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoadError(false);
    const params = new URLSearchParams({
      page_number: page_number.toString(),
    });
    if (category) params.set('category', category);
    axios
      .get(`/api/admin/contactSubmissions?${params}`, {
        headers: { Accept: 'application/json' },
      })
      .then((resp) => {
        setSubmissions(resp.data.data);
        setPagination(resp.data.pagination);
        setLoaded(true);
      })
      .catch((error) => {
        // Ignore canceled/aborted requests (e.g. an in-flight fetch superseded
        // by a re-render) — don't wipe the list and flash "No submissions."
        if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') return;
        console.log(error);
        // Surface the failure instead of leaving the page wedged on "Loading…"
        // when a cold-start request 401s before the admin session is warm.
        setLoadError(true);
        setLoaded(true);
        toast({
          title: 'Could not load submissions',
          description: 'The request failed. Use Retry to try again.',
          variant: 'destructive',
        });
      });
  }, [page_number, category]);

  // Wait for the auth session before the first fetch so the request carries the
  // admin cookie — firing pre-session would 401 and wedge the page.
  useEffect(() => {
    if (!session?.user) return;
    load();
  }, [load, session?.user]);

  function updateStatus(id: string, status: ContactSubmission['status']) {
    axios
      .patch(
        '/api/admin/contactSubmissions',
        { id, status, reason: reasons[id] ?? '' },
        { headers: { 'Content-Type': 'application/json' } }
      )
      .then(() => load())
      .catch((error) => {
        console.log(error);
        toast({
          title: 'Update failed',
          description: 'The submission status could not be changed. Try again.',
          variant: 'destructive',
        });
      });
  }

  function selectCategory(value: ContactCategory | '') {
    setCategory(value);
    // A filtered queue is shorter, so page 4 of "all" is usually past the end
    // of the filtered result. Start over at the top.
    setPageNumber(1);
  }

  function submissionCards() {
    return submissions.map((item) => (
      <Card key={item.id}>
        <CardContent className="p-5">
          <div className="space-y-4">
            {/* Header: status pill + category + timestamp */}
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase ${statusBadge[item.status]}`}
              >
                {item.status}
              </span>
              <span className="text-base font-semibold">
                {CONTACT_CATEGORY_LABELS[item.category] ?? item.category}
              </span>
              <span className="text-muted-foreground ml-auto text-xs">
                Received {standardizeDateTime(new Date(item.createdAt))}
              </span>
            </div>

            {/* Who sent it */}
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <span className="font-semibold">Name:</span> {item.name}
              </div>
              <div>
                <span className="font-semibold">Email:</span>{' '}
                <a
                  href={`mailto:${item.email}`}
                  /* Was `text-pana-blue`, which measures 2.21 on cream and
                   * 2.35 on white — both well under AA. Navy is 15.54. The
                   * underline is permanent rather than hover-only because
                   * navy against ink body copy is under 3:1, so colour alone
                   * cannot be what marks this as a link (WCAG 1.4.1). */
                  className="text-pana-navy underline underline-offset-2"
                >
                  {item.email}
                </a>
              </div>
              <div>
                <span className="font-semibold">Account:</span>{' '}
                {item.screenname ? (
                  <span className="font-medium">@{item.screenname}</span>
                ) : item.userId ? (
                  <span className="text-muted-foreground italic">
                    signed in, no screenname set
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">
                    not signed in
                  </span>
                )}
              </div>
            </div>

            {/* The message itself */}
            {item.message && (
              <div className="text-sm">
                <div className="mb-1 font-semibold">Message:</div>
                <blockquote className="bg-muted/50 text-muted-foreground rounded-md border-l-4 border-pink-400 px-4 py-2 whitespace-pre-wrap">
                  {item.message}
                </blockquote>
              </div>
            )}

            {/* Prior decision, if any. Nothing here is terminal — a handled
                submission can always be reopened. */}
            {item.status !== 'open' && (
              <div className="text-muted-foreground text-sm">
                {item.status === 'actioned' ? 'Actioned' : 'Dismissed'}
                {item.lastModerationActionAt && (
                  <>
                    {' '}
                    {standardizeDateTime(new Date(item.lastModerationActionAt))}
                  </>
                )}
                {item.moderationReason && <>: {item.moderationReason}</>}
              </div>
            )}

            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={item.status === 'actioned'}
                  onClick={() => updateStatus(item.id, 'actioned')}
                >
                  Mark actioned
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={item.status === 'dismissed'}
                  onClick={() => updateStatus(item.id, 'dismissed')}
                >
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={item.status === 'open'}
                  onClick={() => updateStatus(item.id, 'open')}
                >
                  Reopen
                </Button>
                <span className="text-muted-foreground ml-auto text-xs">
                  updated {standardizeDateTime(new Date(item.updatedAt))}
                </span>
              </div>
              {item.status === 'open' && (
                <input
                  type="text"
                  value={reasons[item.id] ?? ''}
                  onChange={(e) =>
                    setReasons((r) => ({ ...r, [item.id]: e.target.value }))
                  }
                  placeholder="Note (optional) — recorded with the decision"
                  className="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    ));
  }

  if (gate) return gate;

  return (
    <>
      <PageMeta title="Contact Us Submissions | Admin" desc="" />
      <div>
        <AdminPageHeader
          eyebrow="Inbox"
          title="Contact submissions"
          description={
            <p>
              Questions, partnership requests, and support messages sent through
              the public contact form.
            </p>
          }
        />
        <div className="space-y-6">
          {/* Category filter */}
          <div className="border-pana-ink/10 flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-[0_8px_24px_rgb(17_13_13_/_0.05)]">
            <Button
              size="sm"
              variant={category === '' ? 'default' : 'outline'}
              onClick={() => selectCategory('')}
            >
              All
            </Button>
            {CONTACT_CATEGORIES.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={category === value ? 'default' : 'outline'}
                onClick={() => selectCategory(value)}
              >
                {CONTACT_CATEGORY_LABELS[value]}
              </Button>
            ))}
          </div>

          <div className="space-y-4">
            {!loaded ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : loadError ? (
              <div className="flex items-center gap-3">
                <p className="text-muted-foreground">
                  Couldn&rsquo;t load submissions.
                </p>
                <Button size="sm" variant="outline" onClick={() => load()}>
                  Retry
                </Button>
              </div>
            ) : submissions.length === 0 ? (
              <p className="text-muted-foreground">No submissions.</p>
            ) : (
              submissionCards()
            )}
          </div>
          <div className="flex items-center gap-4">
            <small>Page: {pagination?.page_number}</small>
            <Button
              onClick={() => setPageNumber(page_number - 1)}
              disabled={pagination?.page_number == 1}
            >
              Previous
            </Button>
            <Button
              onClick={() => setPageNumber(page_number + 1)}
              disabled={pagination?.page_number == pagination?.total_pages}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
