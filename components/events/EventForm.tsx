'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

// Adapted from external/nostrlab's EventForm for layout/UX. The Nostr-signer,
// paid/sats, co-hosts, community, and recurrence fields are intentionally
// dropped for v1 — see docs/EVENTS-ROADMAP.md.

type Mode = 'online' | 'offline' | 'hybrid';

interface VenueOption {
  id: string;
  name: string;
  city: string;
  state: string;
}

interface HostGroupOption {
  id: string;
  handle: string;
  name: string;
  role: string;
}

export interface EventFormInitial {
  slug?: string;
  title?: string;
  description?: string | null;
  coverImage?: string | null;
  coverImageAlt?: string | null;
  venueId?: string | null;
  startsAt?: string | null; // ISO
  endsAt?: string | null; // ISO
  timezone?: string | null;
  mode?: Mode;
  attendeeCap?: number | null;
  tags?: string[];
  visibility?: 'public' | 'unlisted';
}

interface Props {
  initial?: EventFormInitial;
  /** When set, the form PATCHes this slug instead of creating a new event. */
  editSlug?: string;
}

// Convert an ISO string to the value a <input type="datetime-local"> expects.
function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function EventForm({ initial, editSlug }: Props) {
  const router = useRouter();
  const isEditing = !!editSlug;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [coverImage, setCoverImage] = useState(initial?.coverImage ?? '');
  const [coverImageAlt, setCoverImageAlt] = useState(
    initial?.coverImageAlt ?? ''
  );
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'offline');
  const [venueId, setVenueId] = useState(initial?.venueId ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt));
  const [timezone] = useState(
    initial?.timezone ??
      (typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'America/New_York')
  );
  const [attendeeCap, setAttendeeCap] = useState(
    initial?.attendeeCap ? String(initial.attendeeCap) : ''
  );
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>(
    initial?.visibility ?? 'public'
  );

  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [hostGroups, setHostGroups] = useState<HostGroupOption[]>([]);
  // '' means "host as myself". Only offered on create -- moving an existing
  // event to a different host is a transfer, which is its own flow.
  const [hostGroupId, setHostGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/venues?limit=100')
      .then((r) => r.json())
      .then((d) => {
        if (active && d.success) setVenues(d.data.venues);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isEditing) return;
    let active = true;
    fetch('/api/social/actors/me/groups')
      .then((r) => r.json())
      .then((d) => {
        if (!active || !d.success) return;
        // Filtering here is presentation only. The create route recomputes the
        // caller's own admin memberships, so a hand-edited group id is still
        // rejected server-side.
        setHostGroups(
          (d.data.groups as HostGroupOption[]).filter(
            (g) => g.role === 'admin' || g.role === 'moderator'
          )
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isEditing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim() || !startsAt) {
      setErr('A title and start time are required.');
      return;
    }
    if (mode !== 'online' && !venueId) {
      setErr('In-person events need a venue.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        coverImage: coverImage.trim() || null,
        coverImageAlt: coverImageAlt.trim() || null,
        mode,
        venueId: mode === 'online' ? null : venueId || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        timezone,
        attendeeCap: attendeeCap ? parseInt(attendeeCap, 10) : null,
        tags: tags
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
        visibility,
        // Omitted entirely when editing: the PATCH route has no notion of
        // changing hosts, and sending it would be a silent no-op.
        ...(isEditing || !hostGroupId ? {} : { hostGroupId }),
      };

      const res = await fetch(
        isEditing ? `/api/events/${editSlug}` : '/api/events',
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Something went wrong');
      router.push(`/e/${data.data.slug}/manage`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save event');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {err && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {err}
        </p>
      )}

      {!isEditing && hostGroups.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="hostGroup">Hosting as</Label>
          <select
            id="hostGroup"
            value={hostGroupId}
            onChange={(e) => setHostGroupId(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">Myself</option>
            {hostGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            A group event belongs to the group, so it stays on the calendar even
            if you leave.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Community potluck in Little Haiti"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="What's happening, who it's for, what to bring…"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startsAt">Starts</Label>
          <Input
            id="startsAt"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endsAt">Ends (optional)</Label>
          <Input
            id="endsAt"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-gray-500">Times are in {timezone}.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mode">Format</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <SelectTrigger id="mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="offline">In person</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {mode !== 'online' && (
          <div className="space-y-2">
            <Label htmlFor="venue">Venue</Label>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger id="venue">
                <SelectValue placeholder="Choose a venue" />
              </SelectTrigger>
              <SelectContent>
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} — {v.city}, {v.state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cap">Attendee cap (optional)</Label>
          <Input
            id="cap"
            type="number"
            min={1}
            value={attendeeCap}
            onChange={(e) => setAttendeeCap(e.target.value)}
            placeholder="Leave blank for venue limit"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="visibility">Visibility</Label>
          <Select
            value={visibility}
            onValueChange={(v) => setVisibility(v as 'public' | 'unlisted')}
          >
            <SelectTrigger id="visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="unlisted">Unlisted (off-Nostr)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Tags (comma-separated)</Label>
        <Input
          id="tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="music, family-friendly, free"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cover">Cover image URL (optional)</Label>
          <Input
            id="cover"
            value={coverImage ?? ''}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="coverAlt">Cover alt text</Label>
          <Input
            id="coverAlt"
            value={coverImageAlt ?? ''}
            onChange={(e) => setCoverImageAlt(e.target.value)}
            placeholder="Describe the image"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Save changes' : 'Create event'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        Drafts stay hidden until you publish.{' '}
        {visibility === 'unlisted'
          ? 'Unlisted events stay on panamia.club (reachable by direct link) and are not published to Nostr.'
          : 'Publishing a public event also mirrors it to Nostr (relay.panamia.club).'}
      </p>
    </form>
  );
}
