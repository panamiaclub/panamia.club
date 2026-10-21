/**
 * GHL REST API client for the main app.
 *
 * Used by the privacy portal routes (app/api/crm/*).
 * Reads credentials from process.env; returns null from `create()` if
 * GHL_API_KEY is not configured so callers can degrade gracefully.
 */

// LeadConnector API — the endpoint Private Integration Tokens (pit-*) hit.
// The legacy base rest.gohighlevel.com/v1 only accepts legacy API keys and
// rejects PITs with 401 "Api key is invalid."
const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// Newer endpoints (create contact, create opportunity, create task, get
// pipelines) document their Version header as the enum ["v3"] and take *DtoV3
// request bodies, while upsert still documents 2021-04-15/2021-07-28. The
// version is therefore per-request rather than a client-wide constant.
//
// Verified against the live location 2026-07-31 (scripts/ghl-verify.ts):
//   accepts v3 — POST /contacts/, POST /contacts/{id}/tasks,
//                POST /opportunities/, GET /opportunities/pipelines,
//                GET /locations/{id}, GET /locations/{id}/customFields
//   rejects v3 — GET /users/ answers 401 under v3 and 200 under 2021-07-28,
//                which is why getUsers() takes the default version. Note a
//                version rejection is a 401, indistinguishable from a scope
//                failure by status alone.
const GHL_API_VERSION_V3 = 'v3';

/**
 * How long a single GHL call may run before it is abandoned.
 *
 * Without a bound, a GHL that accepts the connection and never answers leaves
 * an unsettled promise, and the Workers runtime kills the whole request with
 * "your Worker's code had hung and would never generate a response" — observed
 * in production 2026-08-07 on GET /api/getProfile (ray a2776034e8199aa6), which
 * reaches this client through the sign-in profile-claim hook in auth.ts. A
 * try/catch cannot rescue a promise that never settles; only an abort can.
 *
 * 5s is a deliberate over-estimate rather than a measured percentile. Sampled
 * round-trips to services.leadconnectorhq.com sit around 120–530ms, so 5s
 * leaves roughly an order of magnitude of headroom for a slow-but-alive API
 * while still failing well inside a page load: /api/getProfile is fetched by
 * components/MainHeader.tsx on every page, so the ceiling has to be a delay a
 * visitor can sit through, not just short of the platform's own limit.
 */
const GHL_TIMEOUT_MS = 5_000;

/**
 * A GHL call that was abandoned at GHL_TIMEOUT_MS.
 *
 * Distinct from GhlApiError because there is no status and no body — nothing
 * came back. Callers that already degrade gracefully on GhlApiError need no
 * change; this simply makes the logged cause read as a timeout on a named
 * endpoint rather than a bare "TimeoutError: The operation was aborted".
 */
export class GhlTimeoutError extends Error {
  readonly method: string;
  readonly path: string;
  readonly timeoutMs: number;

  constructor(method: string, path: string, timeoutMs: number) {
    super(`GHL API timeout after ${timeoutMs}ms — ${method} ${path}`);
    this.name = 'GhlTimeoutError';
    this.method = method;
    this.path = path;
    this.timeoutMs = timeoutMs;
  }
}

export interface GhlContactFields {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  locationId?: string;
  customField?: Record<string, string>;
  tags?: string[];
}

export interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  dateAdded?: string;
  tags?: string[];
  customField?: Array<{ id: string; value: string }>;
  dnd?: boolean;
  dndSettings?: Partial<Record<GhlDndChannel, { status?: string }>>;
}

export type GhlDndStatus = 'active' | 'inactive';

/**
 * The DND channels this app manages, spelled the way the API requires.
 *
 * Verified 2026-07-31: `PUT /contacts/{id}` accepts these capitalized keys and
 * rejects the lowercase spelling with 422; reads come back capitalized too.
 * GHL also exposes GMB and Facebook channels, deliberately omitted — nothing
 * here sends on them, so offering a control implying otherwise would mislead.
 */
export type GhlDndChannel = 'Email' | 'SMS' | 'WhatsApp' | 'Call';

export const GHL_DND_CHANNELS: readonly GhlDndChannel[] = [
  'Email',
  'SMS',
  'WhatsApp',
  'Call',
] as const;

/** A task hanging off a contact — the work item most inquiries route to. */
export interface GhlTask {
  id: string;
  title: string;
  body?: string;
  /** ISO 8601. GHL requires this on create; there is no "no due date" task. */
  dueDate: string;
  completed: boolean;
  assignedTo?: string;
  contactId?: string;
  dateAdded?: string;
}

export interface GhlTaskFields {
  title: string;
  dueDate: string;
  completed: boolean;
  body?: string;
  /** GHL user ID. Unassigned tasks are the failure mode this exists to avoid. */
  assignedTo?: string;
}

export type GhlOpportunityStatus = 'open' | 'won' | 'lost' | 'abandoned';

export interface GhlOpportunity {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId?: string;
  status: GhlOpportunityStatus;
  contactId?: string;
  assignedTo?: string;
  monetaryValue?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface GhlOpportunityFields {
  pipelineId: string;
  name: string;
  status: GhlOpportunityStatus;
  contactId: string;
  pipelineStageId?: string;
  assignedTo?: string;
  monetaryValue?: number;
}

export interface GhlPipelineStage {
  id: string;
  name: string;
  position?: number;
}

export interface GhlPipeline {
  id: string;
  name: string;
  stages: GhlPipelineStage[];
}

export interface GhlUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  roles?: { type?: string; role?: string };
}

export interface GhlOutboundMessage {
  id: string | null;
  conversationId: string | null;
  status: string | null;
}

/**
 * A non-2xx response from GHL, carrying the status and raw body.
 *
 * Callers need the status, not just a message: a 404 on a contact read means
 * the ID is stale and must be re-resolved by email (contact IDs are caches,
 * not references — a dashboard merge invalidates the absorbed contact's ID),
 * and a 400 on create may carry the ID of the duplicate that blocked it.
 */
export class GhlApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly method: string;
  readonly path: string;

  constructor(status: number, method: string, path: string, body: string) {
    super(
      `GHL API ${status} — ${method} ${path}${body ? ` — ${body.slice(0, 200)}` : ''}`
    );
    this.name = 'GhlApiError';
    this.status = status;
    this.method = method;
    this.path = path;
    this.body = body;
  }

  /**
   * When a location disallows duplicate contacts, GHL rejects POST /contacts/
   * with 400 and returns the offending contact's ID in `meta.contactId`.
   * Returns null when the body has no such pointer.
   */
  get duplicateContactId(): string | null {
    try {
      const parsed = JSON.parse(this.body) as {
        meta?: { contactId?: string };
      };
      return parsed.meta?.contactId ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Whether this error means "that record does not exist".
   *
   * Observed 2026-07-31 against the live location: reading an unknown contact
   * returns **400**, not 404, with `{"error":"Contact with id X not found"}`.
   * Matching on status alone would treat a merged-away contact as a hard
   * failure and never re-resolve it, so the message is part of the test.
   *
   * Deliberately narrow: a 400 without "not found" is a malformed request and
   * must keep throwing rather than be mistaken for a missing record.
   */
  get isNotFound(): boolean {
    if (this.status === 404) return true;
    if (this.status !== 400) return false;
    return /not found/i.test(this.body);
  }
}

export class GhlClient {
  private readonly apiKey: string;
  readonly locationId: string;

  private constructor(apiKey: string, locationId: string) {
    this.apiKey = apiKey;
    this.locationId = locationId;
  }

  /** Returns a GhlClient if credentials are configured, otherwise null. */
  static create(): GhlClient | null {
    const apiKey = process.env.GHL_API_KEY;
    const locationId = process.env.GHL_LOCATION_ID;
    if (!apiKey || !locationId) return null;
    return new GhlClient(apiKey, locationId);
  }

  private headers(version: string): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Version: version,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    version: string = GHL_API_VERSION
  ): Promise<T> {
    // The signal stays attached to the response body, so the deadline covers
    // the body read as well as the connect/headers phase — a GHL that sends
    // headers and then stalls mid-body is bounded too. Reading the body is
    // therefore inside the try, not after it.
    try {
      const res = await fetch(`${GHL_API_BASE}${path}`, {
        method,
        headers: this.headers(version),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(GHL_TIMEOUT_MS),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new GhlApiError(res.status, method, path, detail);
      }
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    } catch (err) {
      if (err instanceof GhlApiError) throw err;
      // workerd raises DOMException "TimeoutError" for AbortSignal.timeout and
      // "AbortError" for a manual abort; Node raises AbortError for both on
      // some versions. Match on either so the mapping holds in dev and prod.
      if (
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      ) {
        throw new GhlTimeoutError(method, path, GHL_TIMEOUT_MS);
      }
      throw err;
    }
  }

  /** Get a contact by ID. */
  async getContactById(id: string): Promise<GhlContact> {
    const data = await this.request<{ contact: GhlContact }>(
      'GET',
      `/contacts/${id}`
    );
    return data.contact;
  }

  /** Search for a contact by email. Returns null if not found. */
  async findByEmail(email: string): Promise<GhlContact | null> {
    const data = await this.request<{ contacts: GhlContact[] }>(
      'GET',
      `/contacts/search?email=${encodeURIComponent(email)}&locationId=${encodeURIComponent(this.locationId)}`
    );
    return data.contacts?.[0] ?? null;
  }

  /** Delete a contact by ID. */
  async deleteContact(id: string): Promise<void> {
    await this.request<void>('DELETE', `/contacts/${id}`);
  }

  /**
   * Create a contact. `locationId` is injected; per the v3 schema it is the
   * only required field, so validating that we're not writing a nameless,
   * emailless record is the caller's job, not the API's.
   *
   * Throws GhlApiError on a duplicate when the location disallows them; read
   * `duplicateContactId` off the error to recover the existing record.
   */
  async createContact(fields: GhlContactFields): Promise<GhlContact> {
    const data = await this.request<{ contact: GhlContact }>(
      'POST',
      '/contacts/',
      { ...fields, locationId: this.locationId },
      GHL_API_VERSION_V3
    );
    return data.contact;
  }

  /**
   * Create or update a contact, matched per the location's "Allow Duplicate
   * Contact" setting. `new` distinguishes a create from an update.
   *
   * Note `tags` here *replaces* the contact's whole tag set — the docs steer
   * callers to the add/remove tag endpoints instead. Routing must never send
   * tags through this path or it would strip tags written by the Stripe relay
   * (`panamia-subscriber`) off an existing member.
   */
  async upsertContact(
    fields: GhlContactFields
  ): Promise<{ contact: GhlContact; isNew: boolean }> {
    const data = await this.request<{
      contact: GhlContact;
      new?: boolean;
    }>('POST', '/contacts/upsert', {
      ...fields,
      locationId: this.locationId,
    });
    return { contact: data.contact, isNew: data.new ?? false };
  }

  /**
   * Resolve a possibly-stale contact ID, per the spec's "IDs are caches, not
   * references" rule: a dashboard merge is irreversible and invalidates the
   * absorbed contact's ID, so a 404 means re-resolve by email rather than
   * fail. Returns the live ID, or null if no contact matches the email.
   *
   * Only a missing record triggers re-resolution — a 401 or 5xx propagates, so
   * a transport failure is never mistaken for a merged-away contact. Note GHL
   * signals "no such contact" with a 400 carrying "not found", not a 404; see
   * GhlApiError.isNotFound.
   */
  async resolveContactId(
    cachedId: string | null,
    email: string
  ): Promise<string | null> {
    const contact = await this.resolveContact(cachedId, email);
    return contact?.id ?? null;
  }

  /**
   * Resolve and return a possibly-stale contact in one read path.
   *
   * Campaign eligibility needs the contact's phone and SMS DND state after
   * resolving its ID. Returning the contact avoids immediately fetching the
   * same record a second time.
   */
  async resolveContact(
    cachedId: string | null,
    email: string
  ): Promise<GhlContact | null> {
    if (cachedId) {
      try {
        return await this.getContactById(cachedId);
      } catch (err) {
        if (!(err instanceof GhlApiError) || !err.isNotFound) throw err;
      }
    }
    return this.findByEmail(email);
  }

  /**
   * Add tags to a contact, leaving existing tags in place.
   *
   * UNVERIFIED: this path is carried over from the bridge client and is not
   * covered by the docs pulled so far. Confirm with scripts/ghl-verify.ts
   * before relying on it.
   */
  async addTags(id: string, tags: string[]): Promise<string[]> {
    const data = await this.request<{ tags?: string[] }>(
      'POST',
      `/contacts/${id}/tags`,
      { tags }
    );
    return data?.tags ?? [];
  }

  /** Remove tags from a contact. UNVERIFIED — see addTags. */
  async removeTags(id: string, tags: string[]): Promise<void> {
    await this.request<unknown>('DELETE', `/contacts/${id}/tags`, { tags });
  }

  /**
   * Create a task against a contact.
   *
   * `dueDate` and `completed` are both required by the API — there is no
   * open-ended task — so callers must pick a due date rather than omit one.
   * `assignedTo` is optional to the API but not to the spec: an unassigned
   * task lands in exactly the unowned pile this routing exists to avoid.
   */
  async createTask(contactId: string, fields: GhlTaskFields): Promise<GhlTask> {
    const data = await this.request<{ task: GhlTask }>(
      'POST',
      `/contacts/${contactId}/tasks`,
      fields,
      GHL_API_VERSION_V3
    );
    return data.task;
  }

  /** List a contact's tasks. */
  async getTasks(contactId: string): Promise<GhlTask[]> {
    const data = await this.request<{ tasks?: GhlTask[] }>(
      'GET',
      `/contacts/${contactId}/tasks`
    );
    return data?.tasks ?? [];
  }

  /**
   * Flip a task's completed flag — the outbound half of task sync, fired when
   * an admin resolves the submission in the app queue.
   *
   * GHL exposes a dedicated completed endpoint alongside the general task
   * update; this uses the narrow one so a sync write can never clobber a
   * title, due date, or assignee a human changed in the dashboard.
   */
  async setTaskCompleted(
    contactId: string,
    taskId: string,
    completed: boolean
  ): Promise<void> {
    await this.request<unknown>(
      'PUT',
      `/contacts/${contactId}/tasks/${taskId}/completed`,
      { completed }
    );
  }

  /**
   * Delete a task.
   *
   * Observed 2026-07-31: this answers 200 while leaving the task in place, and
   * deleting the owning contact does not cascade to it either. Do not treat a
   * resolved promise as proof the task is gone — re-read `getTasks` if it
   * matters. No app path depends on this today; it exists for cleanup tooling.
   */
  async deleteTask(contactId: string, taskId: string): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/contacts/${contactId}/tasks/${taskId}`
    );
  }

  /**
   * Create an opportunity. Reserved for `press` inquiries so the pipeline
   * stays a meaningful measure rather than a log of every inquiry.
   */
  async createOpportunity(
    fields: GhlOpportunityFields
  ): Promise<GhlOpportunity> {
    const data = await this.request<{ opportunity: GhlOpportunity }>(
      'POST',
      '/opportunities/',
      { ...fields, locationId: this.locationId },
      GHL_API_VERSION_V3
    );
    return data.opportunity;
  }

  /** Get an opportunity by ID. 404 means it was deleted or merged away. */
  async getOpportunity(id: string): Promise<GhlOpportunity> {
    const data = await this.request<{ opportunity: GhlOpportunity }>(
      'GET',
      `/opportunities/${id}`
    );
    return data.opportunity;
  }

  /** Move an opportunity's stage and/or status — the outbound sync write. */
  async updateOpportunity(
    id: string,
    fields: Partial<
      Pick<
        GhlOpportunityFields,
        'name' | 'status' | 'pipelineStageId' | 'assignedTo' | 'monetaryValue'
      >
    >
  ): Promise<GhlOpportunity> {
    const data = await this.request<{ opportunity: GhlOpportunity }>(
      'PUT',
      `/opportunities/${id}`,
      fields
    );
    return data.opportunity;
  }

  /** Delete an opportunity. */
  async deleteOpportunity(id: string): Promise<void> {
    await this.request<void>('DELETE', `/opportunities/${id}`);
  }

  /**
   * List pipelines and their stages. Resolves the Inquiries pipeline and its
   * stage IDs at runtime so stage IDs are never hardcoded in a deploy.
   *
   * The published schema types `stages` only as a bare array, so the stage
   * object shape below is inferred and needs confirming against a real
   * response.
   */
  async getPipelines(): Promise<GhlPipeline[]> {
    const data = await this.request<{ pipelines?: GhlPipeline[] }>(
      'GET',
      `/opportunities/pipelines?locationId=${encodeURIComponent(this.locationId)}`,
      undefined,
      GHL_API_VERSION_V3
    );
    return data?.pipelines ?? [];
  }

  /**
   * List users on the location. Backs the role-to-user mapping check — the
   * spec notes assignment fails silently if a role's user is deactivated, so
   * the sync path needs to be able to verify an assignee still exists.
   */
  async getUsers(): Promise<GhlUser[]> {
    const data = await this.request<{ users?: GhlUser[] }>(
      'GET',
      `/users/?locationId=${encodeURIComponent(this.locationId)}`
    );
    return data?.users ?? [];
  }

  /**
   * Submit one SMS to HighLevel.
   *
   * HighLevel's messaging endpoint is contact-scoped rather than bulk: each
   * recipient gets its own request and its own provider message ID. A future
   * time is delegated to HighLevel with scheduledTimestamp so the application
   * does not need a minute-level sending cron.
   */
  async sendSms(
    contactId: string,
    message: string,
    scheduledAt?: Date | null
  ): Promise<GhlOutboundMessage> {
    const data = await this.request<{
      id?: string;
      messageId?: string;
      conversationId?: string;
      status?: string;
      message?: {
        id?: string;
        messageId?: string;
        conversationId?: string;
        status?: string;
      };
    }>('POST', '/conversations/messages', {
      type: 'SMS',
      contactId,
      message,
      ...(scheduledAt
        ? { scheduledTimestamp: Math.floor(scheduledAt.getTime() / 1000) }
        : {}),
    });

    return {
      id:
        data.messageId ??
        data.id ??
        data.message?.messageId ??
        data.message?.id ??
        null,
      conversationId:
        data.conversationId ?? data.message?.conversationId ?? null,
      status: data.status ?? data.message?.status ?? null,
    };
  }

  /** Enroll a contact in a workflow by ID. */
  async enrollInWorkflow(contactId: string, workflowId: string): Promise<void> {
    await this.request<void>(
      'POST',
      `/contacts/${contactId}/workflow/${workflowId}`
    );
  }

  /**
   * Set DND on all channels — effectively unsubscribes the contact from all marketing.
   *
   * LeadConnector v2 has no dedicated DND endpoint; DND is updated via the
   * standard contact update with `dnd: true` (top-level switch covering all
   * channels) and explicit per-channel `dndSettings`.
   *
   * Verified 2026-07-31 (scripts/ghl-dnd-probe.ts): `PUT /contacts/{id}/dnd`
   * answers 404 "Cannot PUT", and this shape returns 200 with all four channels
   * reading back as active. The capitalized keys below are required — the
   * lowercase spelling from GHL's create-contact v3 schema is rejected here
   * with 422 ("dndSettings.property email should not exist"). It fails loudly
   * rather than silently, so a wrong casing cannot leave DND half-applied.
   */
  async setDndAll(id: string): Promise<void> {
    await this.request<unknown>('PUT', `/contacts/${id}`, {
      dnd: true,
      dndSettings: {
        Email: { status: 'active' as GhlDndStatus, code: 'user_unsubscribe' },
        SMS: { status: 'active' as GhlDndStatus, code: 'user_unsubscribe' },
        WhatsApp: {
          status: 'active' as GhlDndStatus,
          code: 'user_unsubscribe',
        },
        Call: { status: 'active' as GhlDndStatus, code: 'user_unsubscribe' },
      },
    });
  }

  /**
   * Set DND per channel, writing the complete set every time.
   *
   * Sending all four channels on every write is deliberate. Verified
   * 2026-07-31 that GHL *merges* a partial `dndSettings` rather than replacing
   * it, so a single-key write would in fact be safe today — but that behavior
   * is undocumented, and the analogous case (upsert's `tags`) replaces. Writing
   * the full set costs nothing and is correct under either behavior, so callers
   * pass the desired state of every channel, not just the one they change.
   *
   * The top-level `dnd` flag is set only when every channel is suppressed. It
   * is a master switch, not a gate: verified that one channel can be suppressed
   * with `dnd: false` and reads back suppressed, which is what makes
   * per-channel control possible at all.
   */
  async setDndChannels(
    id: string,
    active: Record<GhlDndChannel, boolean>
  ): Promise<void> {
    const dndSettings = Object.fromEntries(
      GHL_DND_CHANNELS.map((channel) => [
        channel,
        {
          status: (active[channel] ? 'active' : 'inactive') as GhlDndStatus,
          code: active[channel] ? 'user_unsubscribe' : 'user_resubscribe',
        },
      ])
    );
    await this.request<unknown>('PUT', `/contacts/${id}`, {
      dnd: GHL_DND_CHANNELS.every((channel) => active[channel]),
      dndSettings,
    });
  }

  /**
   * Clear DND on all channels — re-subscribes the contact to marketing.
   *
   * Mirror of setDndAll: PUT /contacts/{id} with `dnd: false` and per-channel
   * `dndSettings` reset to inactive. Contact must already exist; this does
   * not undo a deleted record.
   */
  async clearDndAll(id: string): Promise<void> {
    await this.request<unknown>('PUT', `/contacts/${id}`, {
      dnd: false,
      dndSettings: {
        Email: { status: 'inactive' as GhlDndStatus, code: 'user_resubscribe' },
        SMS: { status: 'inactive' as GhlDndStatus, code: 'user_resubscribe' },
        WhatsApp: {
          status: 'inactive' as GhlDndStatus,
          code: 'user_resubscribe',
        },
        Call: { status: 'inactive' as GhlDndStatus, code: 'user_resubscribe' },
      },
    });
  }
}
