/**
 * GHL API capability probe — validates docs/CONTACT-ROADMAP.md against the
 * live account.
 *
 * Every assumption the routing design rests on is a step here: which Version
 * header each endpoint accepts, whether duplicate creates surface the existing
 * contact ID, whether add-tag is additive, whether tasks and opportunities can
 * be created and assigned. Each step records PASS/FAIL plus the observed
 * status and response shape to a timestamped log under scripts/ghl-verify-logs/.
 *
 * Writes to PRODUCTION. Everything it creates is named "Test Contact <runId>"
 * and torn down at the end unless --keep is passed. Run interactively:
 *
 *   npx tsx scripts/ghl-verify.ts \
 *     --api-key=pit-xxxx --location-id=xxxx [flags]
 *
 * Required:
 *   --api-key=       Private Integration Token for the sub-account
 *   --location-id=   the sub-account (location) to probe
 *
 * Optional:
 *   --pipeline-id=   pipeline for the opportunity step; asked interactively if
 *                    omitted, and skipped under --yes rather than guessed
 *   --email-domain=  overrides the non-deliverable domain test contacts use
 *   --read-only      preflight steps only, no writes
 *   --yes            no prompts
 *   --keep           skip teardown
 *
 * Credentials are passed as arguments, not read from .env.local, so the probe
 * targets the location you name rather than whatever the app is configured for.
 * They will appear in the shell's process list and history.
 *
 * Scopes the Private Integration Token needs. GHL answers an out-of-scope call
 * with 401 — the same status as a bad token — so grant these before running or
 * the results are indistinguishable from an auth failure.
 *
 * [doc] is confirmed by the endpoint's API reference page; the rest follow
 * GHL's naming convention and are a guess. If the Private Integrations UI
 * spells one differently, the UI is right.
 *
 *   --read-only needs:
 *     locations.readonly                 GET /locations/{id}
 *     locations/customFields.readonly    GET /locations/{id}/customFields
 *     users.readonly                     GET /users/
 *     opportunities.readonly       [doc] GET /opportunities/pipelines
 *
 *   a full run adds:
 *     contacts.readonly                  GET /contacts/{id}, GET .../tasks
 *     contacts.write               [doc] POST/PUT/DELETE contacts, tags, tasks
 *     opportunities.write          [doc] POST/PUT/DELETE /opportunities/
 *
 * contacts.write covers more than the name suggests: Create Contact, Create
 * Task, and the contact-tag endpoints all list it, so tasks need no scope of
 * their own. locations/tags.write is NOT needed — that governs creating tag
 * definitions at location level, which this path never does.
 *
 * Each result names the scope its endpoint requires, and the summary lists any
 * that came back 401, so a wrong guess above is self-correcting on first run.
 *
 * Logs land in scripts/ghl-verify-logs/, which is gitignored — they contain
 * staff user IDs and emails.
 */

import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const LOG_DIR = join(import.meta.dirname, 'ghl-verify-logs');

const argv = process.argv.slice(2);
const args = new Set(argv);

/** Read a `--name=value` argument. */
function arg(name: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3) || undefined;
}

// Credentials come from the command line rather than .env.local. The probe is
// pointed at whichever location is being validated, which is not necessarily
// the one the app is configured for — reading the dotenv file would bind it to
// the app's location silently, which is the wrong default for a tool whose
// entire job is writing test records into a chosen account.
//
// Note this puts the token in the shell's process list and history.
const API_KEY = arg('api-key');
const LOCATION_ID = arg('location-id');

// Which pipeline the opportunity step writes into. Never guessed: pass it, pick
// from the list interactively, or the step is skipped.
const PIPELINE_ID = arg('pipeline-id');

// Test contacts are addressed here. Defaults to a subdomain that does not
// accept mail, so if a "Contact Created" workflow fires, the send bounces
// somewhere harmless instead of at a real inbox on the live domain.
const TEST_EMAIL_DOMAIN = arg('email-domain') ?? 'invalid.test.panamia.club';

const AUTO_YES = args.has('--yes');
const READ_ONLY = args.has('--read-only');
const KEEP = args.has('--keep');

// Short, greppable, and stamped into every record so a failed teardown leaves
// something a human can find in the dashboard.
const runId = new Date()
  .toISOString()
  .replace(/[-:T.]/g, '')
  .slice(0, 14);

interface Attempt {
  status: number;
  ok: boolean;
  body: unknown;
  raw: string;
}

interface StepResult {
  id: string;
  title: string;
  verdict: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
  observed?: unknown;
}

const results: StepResult[] = [];

// Records created during the run, torn down in reverse order.
const created = {
  contactIds: [] as string[],
  tasks: [] as { contactId: string; taskId: string }[],
  opportunityIds: [] as string[],
};

/**
 * The scope each endpoint requires, per the GHL API reference.
 *
 * A Private Integration Token carries a fixed set of scopes chosen when it is
 * issued, and GHL answers a call outside them with 401 — the same status as a
 * bad token — so a scope gap and an auth failure are indistinguishable from the
 * response alone. Naming the scope next to every result is what makes them
 * tellable apart: a 401 on one endpoint with 200s elsewhere is a missing scope,
 * while 401 everywhere is the token.
 */
function scopeFor(method: string, path: string): string {
  const isWrite = method !== 'GET';
  const route = path.split('?')[0];

  if (route.startsWith('/locations/')) {
    if (route.includes('/customFields'))
      return 'locations/customFields.readonly';
    if (route.includes('/tags')) {
      return isWrite ? 'locations/tags.write' : 'locations/tags.readonly';
    }
    return 'locations.readonly';
  }
  if (route.startsWith('/users')) return 'users.readonly';
  if (route.startsWith('/opportunities')) {
    return isWrite ? 'opportunities.write' : 'opportunities.readonly';
  }
  // Tasks and contact tags both live under /contacts and share its scopes.
  if (route.startsWith('/contacts')) {
    return isWrite ? 'contacts.write' : 'contacts.readonly';
  }
  return 'unknown';
}

/**
 * Every 401 seen, and every route that ever succeeded.
 *
 * A 401 does not imply a scope gap: GHL also answers 401 when an endpoint
 * rejects the Version header, so the same route can 401 under `v3` and return
 * 200 under `2021-07-28`. Attributing those to scopes sends you to the wrong
 * settings page. A 401 only means "missing scope" if that route never
 * succeeded under any version.
 */
const unauthorized: Array<{
  method: string;
  route: string;
  scope: string;
  version: string;
}> = [];
const succeeded = new Set<string>();

async function call(
  method: string,
  path: string,
  version: string,
  body?: unknown
): Promise<Attempt> {
  const res = await fetch(`${GHL_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Version: version,
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }
  const route = path.split('?')[0];
  if (res.ok) succeeded.add(`${method} ${route}`);
  if (res.status === 401) {
    unauthorized.push({
      method,
      route,
      scope: scopeFor(method, path),
      version,
    });
  }
  return { status: res.status, ok: res.ok, body: parsed, raw };
}

/**
 * Run the same request under both Version spellings. The v3 docs declare the
 * header enum as ["v3"] while the client has always sent 2021-07-28, so which
 * one the deployed API actually honors is the single most load-bearing
 * unknown in the integration.
 *
 * Only used on idempotent reads — sending a create twice would double the
 * records.
 */
async function compareVersions(
  method: string,
  path: string
): Promise<{ v3: Attempt; dated: Attempt }> {
  const v3 = await call(method, path, 'v3');
  const dated = await call(method, path, '2021-07-28');
  return { v3, dated };
}

let rl: ReturnType<typeof createInterface> | null = null;

async function confirm(prompt: string): Promise<boolean> {
  if (AUTO_YES) return true;
  rl ??= createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n  ${prompt} [y/N] `);
  return answer.trim().toLowerCase().startsWith('y');
}

/** Step titles are "METHOD /path", so the scope falls out of the title. */
function scopeForTitle(title: string): string {
  const m = title.match(/^([A-Z]+)\s+(\S+)/);
  return m ? scopeFor(m[1], m[2]) : 'unknown';
}

function record(r: StepResult): void {
  results.push(r);
  // Plain-text marks: the pre-commit emoji screen rejects U+2600-U+27BF, which
  // is where check and cross glyphs live.
  console.log(`  [${r.verdict.padEnd(4)}] ${r.id}  ${r.detail}`);
  // Name the scope on failure only — on success it is noise, but on a 401 it is
  // the single most useful thing the run can tell you.
  if (r.verdict === 'FAIL') {
    console.log(`           requires scope: ${scopeForTitle(r.title)}`);
  }
}

function summarize(body: unknown): string {
  if (body === null || body === undefined) return '(empty)';
  if (typeof body === 'string') return body.slice(0, 200);
  const json = JSON.stringify(body);
  return json.length > 400 ? `${json.slice(0, 400)}…` : json;
}

/**
 * Mirrors GhlApiError.isNotFound in lib/ghl.ts. GHL signals a missing contact
 * with 400 and "not found" in the body rather than a 404, so both clients have
 * to agree on that test or the probe passes something the app would throw on.
 */
function looksNotFound(a: Attempt): boolean {
  if (a.status === 404) return true;
  if (a.status !== 400) return false;
  return /not found/i.test(a.raw);
}

/** Records this run created and could not remove. Reported loudly at the end. */
const leaked: string[] = [];

/**
 * Whether a task still exists, checked two ways.
 *
 * Observed 2026-07-31: after a delete the task list stopped returning the task
 * while the dashboard still showed it, completed and green-checked. A list scan
 * alone therefore reports "confirmed gone" for a record a human can still see,
 * which is worse than not checking at all — it launders a leak into a PASS.
 * The direct task read is authoritative here and the list is a cross-check;
 * either one finding it counts as present.
 *
 * Anything unreadable counts as present. Warning about a record that is
 * actually gone costs a glance; staying quiet about one that is not costs
 * manual cleanup nobody knows to do.
 */
async function taskStillExists(
  contactId: string,
  taskId: string
): Promise<{ present: boolean; how: string }> {
  const direct = await call(
    'GET',
    `/contacts/${contactId}/tasks/${taskId}`,
    '2021-07-28'
  );
  if (direct.ok) return { present: true, how: 'GET task returned 200' };
  if (!looksNotFound(direct)) {
    return { present: true, how: `unverifiable (GET task ${direct.status})` };
  }

  const list = await call('GET', `/contacts/${contactId}/tasks`, '2021-07-28');
  if (!list.ok) {
    return { present: true, how: `unverifiable (list ${list.status})` };
  }
  const tasks = (list.body as { tasks?: Array<{ id?: string }> })?.tasks ?? [];
  return tasks.some((t) => t.id === taskId)
    ? { present: true, how: 'absent from GET task but still in the task list' }
    : { present: false, how: 'absent from both the task read and the list' };
}

/** Top-level keys of a response object — the shape a spec cares about. */
function shapeOf(body: unknown): string[] {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return Object.keys(body as Record<string, unknown>);
  }
  return [];
}

async function main(): Promise<void> {
  if (!API_KEY || !LOCATION_ID) {
    console.error(
      'FATAL: --api-key= and --location-id= are required.\n' +
        '  npx tsx scripts/ghl-verify.ts --api-key=pit-xxxx --location-id=xxxx --read-only'
    );
    process.exit(1);
  }

  console.log(`\nGHL capability probe — run ${runId}`);
  console.log(`location: ${LOCATION_ID}`);
  console.log(`mode:     ${READ_ONLY ? 'read-only' : 'read + write'}`);
  if (!READ_ONLY) {
    console.log(
      '\n  This writes to the PRODUCTION location. Contacts created here can\n' +
        '  trigger any Workflow with a "Contact Created" trigger, which may send\n' +
        '  real email to the test address. Check Automation → Workflows first.'
    );
    if (!(await confirm('Proceed against production?'))) {
      console.log('Aborted. Nothing was written.');
      rl?.close();
      return;
    }
  }

  // --- Preflight: read-only scope and structure discovery -----------------
  console.log('\nPreflight (read-only)');

  const loc = await compareVersions('GET', `/locations/${LOCATION_ID}`);
  record({
    id: 'pre.location',
    title: 'GET /locations/{id}',
    verdict: loc.v3.ok || loc.dated.ok ? 'PASS' : 'FAIL',
    detail: `v3=${loc.v3.status} dated=${loc.dated.status}`,
    observed: { v3: loc.v3.status, dated: loc.dated.status },
  });

  const pipelinesAttempt = await compareVersions(
    'GET',
    `/opportunities/pipelines?locationId=${encodeURIComponent(LOCATION_ID)}`
  );
  const pipelineBody = (
    pipelinesAttempt.v3.ok
      ? pipelinesAttempt.v3.body
      : pipelinesAttempt.dated.body
  ) as { pipelines?: Array<Record<string, unknown>> } | null;
  const pipelines = pipelineBody?.pipelines ?? [];
  record({
    id: 'pre.pipelines',
    title: 'GET /opportunities/pipelines',
    verdict: pipelines.length > 0 ? 'PASS' : 'FAIL',
    detail:
      `v3=${pipelinesAttempt.v3.status} dated=${pipelinesAttempt.dated.status} — ` +
      `${pipelines.length} pipeline(s): ${pipelines.map((p) => p.name).join(', ') || 'none'}`,
    // Answers Open Question 3 (what is the existing pipeline named?) and
    // pins down the stage object shape the published schema leaves untyped.
    observed: pipelines,
  });

  const users = await compareVersions(
    'GET',
    `/users/?locationId=${encodeURIComponent(LOCATION_ID)}`
  );
  const userBody = (users.v3.ok ? users.v3.body : users.dated.body) as {
    users?: Array<Record<string, unknown>>;
  } | null;
  record({
    id: 'pre.users',
    title: 'GET /users/',
    verdict: users.v3.ok || users.dated.ok ? 'PASS' : 'FAIL',
    detail:
      `v3=${users.v3.status} dated=${users.dated.status} — ` +
      `${userBody?.users?.length ?? 0} user(s)`,
    // Backs the role-to-user mapping: these are the only valid assignees.
    observed: userBody?.users?.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
    })),
  });

  const fields = await compareVersions(
    'GET',
    `/locations/${LOCATION_ID}/customFields`
  );
  const fieldBody = (fields.v3.ok ? fields.v3.body : fields.dated.body) as {
    customFields?: Array<Record<string, unknown>>;
  } | null;
  record({
    id: 'pre.customFields',
    title: 'GET /locations/{id}/customFields',
    verdict: fields.v3.ok || fields.dated.ok ? 'PASS' : 'FAIL',
    // Answers Open Question 5 (do the panamia_* custom fields exist?).
    detail:
      `v3=${fields.v3.status} dated=${fields.dated.status} — ` +
      `panamia_* fields: ${
        fieldBody?.customFields
          ?.map((f) => String(f.fieldKey ?? f.name ?? ''))
          .filter((k) => k.includes('panamia'))
          .join(', ') || 'none'
      }`,
    observed: fieldBody?.customFields?.map((f) => ({
      id: f.id,
      name: f.name,
      fieldKey: f.fieldKey,
    })),
  });

  if (READ_ONLY) {
    await finish();
    return;
  }

  // --- Writes -------------------------------------------------------------
  console.log('\nContact creation');

  const testEmail = `test-contact-${runId}@${TEST_EMAIL_DOMAIN}`;
  const contactBody = {
    firstName: 'Test',
    lastName: `Contact ${runId}`,
    name: `GChriss Test Contact ${runId}`,
    email: testEmail,
    locationId: LOCATION_ID,
    source: 'panamia.club testing',
    tags: ['unverified', 'source:contact-us', 'inquiry:general'],
  };

  let contactId: string | null = null;

  if (await confirm(`Create contact ${testEmail}?`)) {
    // Try v3 first; fall back to the dated version so a rejection tells us
    // which spelling the deployed API enforces rather than just failing.
    let attempt = await call('POST', '/contacts/', 'v3', contactBody);
    let usedVersion = 'v3';
    if (!attempt.ok) {
      attempt = await call('POST', '/contacts/', '2021-07-28', contactBody);
      usedVersion = '2021-07-28';
    }

    const body = attempt.body as {
      contact?: { id?: string; tags?: string[] };
      meta?: { contactId?: string };
    } | null;
    contactId = body?.contact?.id ?? null;
    if (contactId) created.contactIds.push(contactId);

    record({
      id: 'contact.create',
      title: 'POST /contacts/',
      verdict: attempt.ok && contactId ? 'PASS' : 'FAIL',
      detail: `${attempt.status} via Version:${usedVersion} — id=${contactId ?? 'none'}`,
      observed: {
        acceptedVersion: attempt.ok ? usedVersion : null,
        status: attempt.status,
        responseKeys: shapeOf(attempt.body),
        tagsEchoed: body?.contact?.tags,
        body: attempt.ok ? undefined : summarize(attempt.body),
      },
    });

    // Duplicate handling decides whether routing can create-then-recover or
    // must search first. Re-POSTing the identical body is the only way to
    // observe it.
    if (
      contactId &&
      (await confirm('Re-POST the same contact to test duplicate handling?'))
    ) {
      const dup = await call('POST', '/contacts/', usedVersion, contactBody);
      const dupBody = dup.body as {
        contact?: { id?: string };
        meta?: { contactId?: string };
      } | null;
      const surfacedId =
        dupBody?.meta?.contactId ?? dupBody?.contact?.id ?? null;
      // A second 2xx means the location allows duplicates — that record is
      // ours too, so track it for teardown.
      if (dup.ok && dupBody?.contact?.id && dupBody.contact.id !== contactId) {
        created.contactIds.push(dupBody.contact.id);
      }
      record({
        id: 'contact.duplicate',
        title: 'POST /contacts/ (duplicate)',
        verdict: surfacedId ? 'PASS' : 'FAIL',
        detail: dup.ok
          ? `${dup.status} — location ALLOWS duplicates (new id=${dupBody?.contact?.id})`
          : `${dup.status} — rejected; meta.contactId=${dupBody?.meta?.contactId ?? 'absent'}`,
        observed: {
          status: dup.status,
          allowsDuplicates: dup.ok,
          recoverableId: surfacedId,
          body: summarize(dup.body),
        },
      });
    }
  } else {
    record({
      id: 'contact.create',
      title: 'POST /contacts/',
      verdict: 'SKIP',
      detail: 'declined',
    });
  }

  // --- Tags ---------------------------------------------------------------
  if (contactId && (await confirm('Add tag "inquiry:press" to the contact?'))) {
    const before = await call('GET', `/contacts/${contactId}`, '2021-07-28');
    const beforeTags =
      (before.body as { contact?: { tags?: string[] } })?.contact?.tags ?? [];

    const add = await call(
      'POST',
      `/contacts/${contactId}/tags`,
      '2021-07-28',
      {
        tags: ['inquiry:press'],
      }
    );

    const after = await call('GET', `/contacts/${contactId}`, '2021-07-28');
    const afterTags =
      (after.body as { contact?: { tags?: string[] } })?.contact?.tags ?? [];

    // Additive is the requirement: routing must never clobber tags written by
    // the Stripe relay. Verified by re-reading, not by trusting the response.
    const additive =
      beforeTags.every((t) => afterTags.includes(t)) &&
      afterTags.includes('inquiry:press');

    record({
      id: 'contact.addTag',
      title: 'POST /contacts/{id}/tags',
      verdict: add.ok && additive ? 'PASS' : 'FAIL',
      detail: `${add.status} — additive=${additive} (${beforeTags.length}→${afterTags.length} tags)`,
      observed: { beforeTags, afterTags, responseKeys: shapeOf(add.body) },
    });
  }

  // --- Tasks --------------------------------------------------------------
  const assignee =
    (userBody?.users?.[0]?.id as string | undefined) ?? undefined;

  if (contactId && (await confirm('Create a task on the contact?'))) {
    const dueDate = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const taskBody = {
      title: `Contact Us inquiry — Test Contact ${runId}`,
      body: 'Probe record. Safe to delete.',
      dueDate,
      completed: false,
      ...(assignee ? { assignedTo: assignee } : {}),
    };

    let attempt = await call(
      'POST',
      `/contacts/${contactId}/tasks`,
      'v3',
      taskBody
    );
    let usedVersion = 'v3';
    if (!attempt.ok) {
      attempt = await call(
        'POST',
        `/contacts/${contactId}/tasks`,
        '2021-07-28',
        taskBody
      );
      usedVersion = '2021-07-28';
    }

    const task = (
      attempt.body as {
        task?: { id?: string; assignedTo?: string; body?: string };
      }
    )?.task;
    if (task?.id) created.tasks.push({ contactId, taskId: task.id });

    record({
      id: 'task.create',
      title: 'POST /contacts/{id}/tasks',
      verdict: attempt.ok && task?.id ? 'PASS' : 'FAIL',
      detail:
        `${attempt.status} via Version:${usedVersion} — id=${task?.id ?? 'none'} ` +
        `assignedTo=${task?.assignedTo ?? 'UNASSIGNED'}`,
      observed: {
        acceptedVersion: attempt.ok ? usedVersion : null,
        // The spec requires every routed item to have an owner; if the API
        // silently drops assignedTo, that requirement is unmet.
        assignmentHeld: Boolean(assignee) && task?.assignedTo === assignee,
        // The Task carries the inquiry text, so a silently-dropped or
        // truncated body would defeat the point of routing it there.
        bodyEchoed: task?.body,
        responseKeys: shapeOf(attempt.body),
        body: attempt.ok ? undefined : summarize(attempt.body),
      },
    });

    // --- Task completion round trip (Phase 4b) --------------------------
    // Outbound: admin resolves in the app queue -> mark the GHL task done.
    // Inbound:  the bridge polls the task list and flips the app row.
    // Both halves are exercised here because the whole of task sync rests on
    // them, and neither has ever been run against this account.
    if (task?.id) {
      const listBefore = await call(
        'GET',
        `/contacts/${contactId}/tasks`,
        '2021-07-28'
      );
      const tasksBefore =
        (
          listBefore.body as {
            tasks?: Array<{ id?: string; completed?: boolean }>;
          }
        )?.tasks ?? [];
      record({
        id: 'task.list',
        title: 'GET /contacts/{id}/tasks',
        verdict: listBefore.ok && tasksBefore.length > 0 ? 'PASS' : 'FAIL',
        detail: `${listBefore.status} — ${tasksBefore.length} task(s); this is the inbound poll`,
        observed: {
          responseKeys: shapeOf(listBefore.body),
          completedFlagPresent: tasksBefore.some(
            (t) => typeof t.completed === 'boolean'
          ),
        },
      });

      const complete = await call(
        'PUT',
        `/contacts/${contactId}/tasks/${task.id}/completed`,
        '2021-07-28',
        { completed: true }
      );

      // Trust the re-read, not the response: the poll is what production will
      // rely on, so completion has to be visible *there*.
      const listAfter = await call(
        'GET',
        `/contacts/${contactId}/tasks`,
        '2021-07-28'
      );
      const seen = (
        (
          listAfter.body as {
            tasks?: Array<{ id?: string; completed?: boolean }>;
          }
        )?.tasks ?? []
      ).find((t) => t.id === task.id);

      record({
        id: 'task.complete',
        title: 'PUT /contacts/{id}/tasks/{taskId}/completed',
        verdict: complete.ok && seen?.completed === true ? 'PASS' : 'FAIL',
        detail:
          `${complete.status} — completed reads back as ${String(seen?.completed)}` +
          (complete.ok && seen?.completed !== true
            ? ' (WRITE ACCEPTED BUT NOT REFLECTED — task sync would silently no-op)'
            : ''),
        observed: {
          status: complete.status,
          reReadCompleted: seen?.completed,
          responseKeys: shapeOf(complete.body),
          body: complete.ok ? undefined : summarize(complete.body),
        },
      });
    }
  }

  // --- Opportunities ------------------------------------------------------
  type Pipeline = {
    id?: string;
    name?: string;
    stages?: Array<{ id?: string; name?: string }>;
  };

  // Never guess the pipeline. The spec is explicit that a paying member who
  // sends an inquiry must not be moved out of their membership state, so
  // writing a probe opportunity into the wrong pipeline is the mistake to
  // avoid. Prefer the passed ID; otherwise ask; otherwise skip.
  //
  // Note there is no membership pipeline to collide with yet: the one described
  // in CRM-ROADMAP.md is unimplemented, and membership state is currently
  // carried by tags (panamia-subscriber, panamia-churned) written by the Stripe
  // relay. Whatever this call returns is therefore pre-existing GHL structure,
  // not anything the app maintains — which is itself worth reading in the log.
  let pipeline: Pipeline | undefined;
  if (PIPELINE_ID) {
    pipeline = (pipelines as Pipeline[]).find((p) => p.id === PIPELINE_ID);
    if (!pipeline) {
      record({
        id: 'opportunity.create',
        title: 'POST /opportunities/',
        verdict: 'SKIP',
        detail: `GHL_INQUIRIES_PIPELINE_ID=${PIPELINE_ID} matches no pipeline on this location`,
      });
    }
  } else if (contactId && pipelines.length > 0 && !AUTO_YES) {
    console.log('\n  Pipelines on this location:');
    pipelines.forEach((p, i) => console.log(`    ${i + 1}. ${p.name}`));
    rl ??= createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      '  Which to create the test opportunity in? [number, or blank to skip] '
    );
    const idx = Number.parseInt(answer.trim(), 10);
    if (Number.isInteger(idx) && idx >= 1 && idx <= pipelines.length) {
      pipeline = pipelines[idx - 1] as Pipeline;
    } else {
      record({
        id: 'opportunity.create',
        title: 'POST /opportunities/',
        verdict: 'SKIP',
        detail: 'no pipeline chosen',
      });
    }
  } else if (contactId && pipelines.length > 0) {
    record({
      id: 'opportunity.create',
      title: 'POST /opportunities/',
      verdict: 'SKIP',
      detail:
        '--yes with no GHL_INQUIRIES_PIPELINE_ID — refusing to guess a pipeline',
    });
  }

  if (
    contactId &&
    pipeline?.id &&
    (await confirm(`Create an opportunity in pipeline "${pipeline.name}"?`))
  ) {
    const stageId = pipeline.stages?.[0]?.id;
    const oppBody = {
      pipelineId: pipeline.id,
      locationId: LOCATION_ID,
      name: `Press inquiry — Test Contact ${runId}`,
      status: 'open',
      contactId,
      ...(stageId ? { pipelineStageId: stageId } : {}),
      ...(assignee ? { assignedTo: assignee } : {}),
    };

    let attempt = await call('POST', '/opportunities/', 'v3', oppBody);
    let usedVersion = 'v3';
    if (!attempt.ok) {
      attempt = await call('POST', '/opportunities/', '2021-07-28', oppBody);
      usedVersion = '2021-07-28';
    }

    const opp = (
      attempt.body as {
        opportunity?: { id?: string; assignedTo?: string; status?: string };
      }
    )?.opportunity;
    if (opp?.id) created.opportunityIds.push(opp.id);

    record({
      id: 'opportunity.create',
      title: 'POST /opportunities/',
      verdict: attempt.ok && opp?.id ? 'PASS' : 'FAIL',
      detail:
        `${attempt.status} via Version:${usedVersion} — id=${opp?.id ?? 'none'} ` +
        `status=${opp?.status} assignedTo=${opp?.assignedTo ?? 'UNASSIGNED'}`,
      observed: {
        acceptedVersion: attempt.ok ? usedVersion : null,
        stageUsed: stageId ?? '(pipeline default)',
        responseKeys: shapeOf(attempt.body),
        body: attempt.ok ? undefined : summarize(attempt.body),
      },
    });

    // Stage transition is the outbound half of bilateral sync.
    const secondStage = pipeline.stages?.[1]?.id;
    if (opp?.id && secondStage) {
      const moved = await call(
        'PUT',
        `/opportunities/${opp.id}`,
        '2021-07-28',
        {
          pipelineStageId: secondStage,
        }
      );
      record({
        id: 'opportunity.updateStage',
        title: 'PUT /opportunities/{id}',
        verdict: moved.ok ? 'PASS' : 'FAIL',
        detail: `${moved.status} — moved to stage ${pipeline.stages?.[1]?.name}`,
        observed: { status: moved.status, responseKeys: shapeOf(moved.body) },
      });
    }
  }

  // --- Stale-ID reconciliation -------------------------------------------
  // The merge story depends on being able to recognise a contact that no longer
  // resolves. GHL answers 400 with "not found" rather than 404, so the check is
  // status-plus-message; see GhlApiError.isNotFound.
  const ghost = await call(
    'GET',
    '/contacts/ZZZZprobe000000ZZZZ',
    '2021-07-28'
  );
  record({
    id: 'contact.staleId',
    title: 'GET /contacts/{unknown-id}',
    verdict: looksNotFound(ghost) ? 'PASS' : 'FAIL',
    detail: `${ghost.status} — synthetic ID; may be rejected as malformed rather than missing`,
    observed: { status: ghost.status, body: summarize(ghost.body) },
  });

  await teardown();

  // The authoritative version of the same question: a well-formed ID that GHL
  // itself issued and we then deleted. This is what a merged-away contact looks
  // like, and it is the status resolveContactId() has to key on.
  const deletedId = created.contactIds[0];
  if (!KEEP && deletedId) {
    const gone = await call('GET', `/contacts/${deletedId}`, '2021-07-28');
    record({
      id: 'contact.deletedId',
      title: 'GET /contacts/{deleted-id}',
      verdict: looksNotFound(gone) ? 'PASS' : 'FAIL',
      detail: `${gone.status} — real deleted ID; this is the merge/stale case`,
      observed: {
        status: gone.status,
        matchesIsNotFound: looksNotFound(gone),
        body: summarize(gone.body),
      },
    });
  }

  await finish();
}

async function teardown(): Promise<void> {
  if (KEEP) {
    console.log('\nTeardown skipped (--keep). Records left behind:');
    console.log(JSON.stringify(created, null, 2));
    return;
  }
  if (
    !created.contactIds.length &&
    !created.tasks.length &&
    !created.opportunityIds.length
  ) {
    return;
  }

  console.log('\nTeardown');
  for (const id of created.opportunityIds) {
    const res = await call('DELETE', `/opportunities/${id}`, '2021-07-28');
    const gone = looksNotFound(
      await call('GET', `/opportunities/${id}`, '2021-07-28')
    );
    if (!gone) leaked.push(`opportunity ${id}`);
    record({
      id: 'teardown.opportunity',
      title: 'DELETE /opportunities/{id}',
      verdict: gone ? 'PASS' : 'FAIL',
      detail: `${res.status} — ${id}${gone ? '' : ' — STILL PRESENT after delete'}`,
    });
  }
  // Task deletes are verified by reading the task back, not by the status code:
  // observed 2026-07-31, the endpoint answers 200 while leaving the task in
  // place, and deleting the contact does not cascade to it. Verification has to
  // happen here, while the contact still exists to be read.
  for (const { contactId, taskId } of created.tasks) {
    // The probe completes this task earlier to prove the sync round trip, and a
    // completed task survived deletion while still showing in the dashboard.
    // Clearing the flag first removes that as a variable, so a task that
    // survives is a delete failure rather than a completed-state quirk.
    await call(
      'PUT',
      `/contacts/${contactId}/tasks/${taskId}/completed`,
      '2021-07-28',
      { completed: false }
    );

    let res = await call(
      'DELETE',
      `/contacts/${contactId}/tasks/${taskId}`,
      '2021-07-28'
    );
    let usedVersion = '2021-07-28';
    let check = await taskStillExists(contactId, taskId);

    // The task was created under v3; try the same version before giving up.
    if (check.present) {
      res = await call(
        'DELETE',
        `/contacts/${contactId}/tasks/${taskId}`,
        'v3'
      );
      usedVersion = 'v3';
      check = await taskStillExists(contactId, taskId);
    }

    const present = check.present;
    if (present) leaked.push(`task ${taskId} on contact ${contactId}`);
    record({
      id: 'teardown.task',
      title: 'DELETE /contacts/{id}/tasks/{taskId}',
      verdict: present ? 'FAIL' : 'PASS',
      detail: present
        ? `${res.status} under both versions but task ${taskId} IS STILL PRESENT (${check.how}) — delete it by hand`
        : `${res.status} via Version:${usedVersion} — ${taskId} gone (${check.how})`,
      observed: {
        deletedUnderVersion: present ? null : usedVersion,
        verifiedBy: check.how,
        uncompletedFirst: true,
      },
    });
  }
  // Contacts last, because the task check above needs the contact alive to read
  // its tasks. Contact deletion does NOT cascade to tasks.
  for (const id of created.contactIds) {
    const res = await call('DELETE', `/contacts/${id}`, '2021-07-28');
    const gone = looksNotFound(
      await call('GET', `/contacts/${id}`, '2021-07-28')
    );
    if (!gone) leaked.push(`contact ${id}`);
    record({
      id: 'teardown.contact',
      title: 'DELETE /contacts/{id}',
      verdict: gone ? 'PASS' : 'FAIL',
      detail: `${res.status} — ${id}${gone ? ' confirmed gone' : ' — STILL PRESENT after delete'}`,
    });
  }
}

async function finish(): Promise<void> {
  rl?.close();

  const pass = results.filter((r) => r.verdict === 'PASS').length;
  const fail = results.filter((r) => r.verdict === 'FAIL').length;
  const skip = results.filter((r) => r.verdict === 'SKIP').length;

  mkdirSync(LOG_DIR, { recursive: true });

  // Scopes the run actually exercised, and the subset that came back 401.
  const scopesExercised = [
    ...new Set(results.map((r) => scopeForTitle(r.title))),
  ]
    .filter((s) => s !== 'unknown')
    .sort();
  // Split the 401s: a route that later succeeded under a different Version was
  // refusing the header, not the token. Only the rest are scope candidates.
  const versionRejections = unauthorized.filter((u) =>
    succeeded.has(`${u.method} ${u.route}`)
  );
  const scopeRejections = unauthorized.filter(
    (u) => !succeeded.has(`${u.method} ${u.route}`)
  );
  const scopesMissing = [
    ...new Set(scopeRejections.map((u) => u.scope)),
  ].sort();

  const jsonPath = join(LOG_DIR, `${runId}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        runId,
        locationId: LOCATION_ID,
        at: new Date().toISOString(),
        scopesExercised,
        scopesMissing,
        unauthorized,
        leaked,
        results,
      },
      null,
      2
    )
  );

  const md = [
    `# GHL capability probe — ${runId}`,
    '',
    `Location: \`${LOCATION_ID}\`  `,
    `Run at: ${new Date().toISOString()}  `,
    `Result: **${pass} pass, ${fail} fail, ${skip} skipped**`,
    '',
    ...(leaked.length
      ? [
          '## Cleanup required',
          '',
          'These records were created by this run and could not be deleted via',
          'the API. Remove them by hand in the GHL dashboard:',
          '',
          ...leaked.map((l) => `- ${l}`),
          '',
        ]
      : []),
    '## Scopes',
    '',
    `Exercised by this run: ${scopesExercised.map((s) => `\`${s}\``).join(', ') || 'none'}`,
    '',
    ...(scopesMissing.length
      ? [
          `**Rejected with 401 and never succeeded — likely missing scopes:**`,
          '',
          ...scopeRejections.map(
            (u) => `- \`${u.scope}\` — \`${u.method} ${u.route}\``
          ),
          '',
          'A Private Integration Token carries the scopes selected when it was',
          'issued. Add them in GHL: Settings -> Private Integrations -> edit the',
          'integration -> re-copy the token if it is re-issued.',
          '',
          'If *every* call returned 401, the token itself is wrong (expired,',
          'revoked, or an Agency token where a Sub-Account token is required)',
          'rather than under-scoped.',
          '',
        ]
      : ['No scope gaps: every scope this run needed was granted.', '']),
    ...(versionRejections.length
      ? [
          '**401s caused by the Version header, not by scopes.** These routes',
          'succeeded under another version, so the token is fine and the header',
          'is what was refused:',
          '',
          ...versionRejections.map(
            (u) =>
              `- \`${u.method} ${u.route}\` rejects \`Version: ${u.version}\``
          ),
          '',
        ]
      : []),
    '| Step | Endpoint | Scope | Verdict | Detail |',
    '| --- | --- | --- | --- | --- |',
    ...results.map(
      (r) =>
        `| \`${r.id}\` | \`${r.title}\` | \`${scopeForTitle(r.title)}\` | ${r.verdict} | ${r.detail.replace(/\|/g, '\\|')} |`
    ),
    '',
    '## Observed',
    '',
    '```json',
    JSON.stringify(
      results
        .filter((r) => r.observed !== undefined)
        .map((r) => ({ id: r.id, observed: r.observed })),
      null,
      2
    ),
    '```',
    '',
  ].join('\n');
  const mdPath = join(LOG_DIR, `${runId}.md`);
  writeFileSync(mdPath, md);

  console.log(`\n${pass} pass, ${fail} fail, ${skip} skipped`);

  if (scopesMissing.length) {
    // Every call 401ing points at the token, not the scope list — worth saying
    // outright, because adding scopes will not fix a revoked or wrong-type token.
    const everythingFailed = succeeded.size === 0;
    console.log(
      `\n401 on ${scopeRejections.length} endpoint(s) that never succeeded. ${
        everythingFailed
          ? 'Nothing succeeded — suspect the token itself (expired, revoked,\n' +
            'or an Agency token where a Sub-Account token is required) before the scopes.'
          : 'Other calls succeeded, so this is a scope gap, not a bad token.'
      }`
    );
    console.log('\nScopes to add (Settings -> Private Integrations):');
    for (const u of scopeRejections) {
      console.log(`  ${u.scope.padEnd(34)} ${u.method} ${u.route}`);
    }
  }

  if (versionRejections.length) {
    console.log(
      '\nVersion-header 401s (NOT scope gaps — these routes worked under another version):'
    );
    for (const u of versionRejections) {
      console.log(`  ${u.method} ${u.route} rejects Version: ${u.version}`);
    }
  }

  if (leaked.length) {
    console.log(
      `\nCLEANUP REQUIRED — ${leaked.length} record(s) this run created could not` +
        '\nbe deleted via the API. Remove them by hand in the GHL dashboard:'
    );
    for (const l of leaked) console.log(`  ${l}`);
  }

  console.log(`\nlog: ${mdPath}`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nProbe aborted:', err);
  console.error(
    'Records possibly left behind:',
    JSON.stringify(created, null, 2)
  );
  rl?.close();
  process.exit(1);
});
