/**
 * Pure v1 calendar response validator for the PRIVATE HakiSend backend.
 *
 * Does NOT fetch, sync, schedule, publish, send or overwrite anything.
 * A future Obsidian command explicitly requests a Calendar and passes its
 * JSON here. Mismatched Site, excess payload fields and invented send
 * authorization are always rejected.
 */
import {buildUnifiedCalendar, type UnifiedCalendar} from './unified-calendar.ts';
import type {CalendarSource, CalendarKind, CalendarStatus} from './calendar-projection.ts';

const VALID_KINDS = new Set<CalendarKind>([
  'post','post_linked_email','standalone_email',
]);
const STATUSES_BY_KIND: Record<CalendarKind,ReadonlySet<CalendarStatus>> = {
  // This v1 server only proves authoring status, never public visibility.
  post: new Set<CalendarStatus>(['draft','scheduled','published','ambiguous']),
  // No native scheduling or provider receipts are verified yet.
  post_linked_email: new Set<CalendarStatus>(['draft','ambiguous']),
  standalone_email: new Set<CalendarStatus>(['draft','ambiguous','cancelled']),
};
const PAYLOAD_KEYS = new Set(['success','data']);
const SNAPSHOT_KEYS = new Set([
  'contract_version','site_uid','as_of_utc_ms','truncated','read_only','events',
]);
const ALLOWED_FIELDS = new Set([
  'uid','kind','siteUid','title','status','serverConfirmed',
  'scheduledAtUtcMs','linkedPostUid','sendAuthorized',
  'postPublishAtUtcMs','postUnpublishAtUtcMs',
  'publicVisibility','scheduleAuthorization',
]);
const UID = /^[a-z0-9][a-z0-9_.:-]{0,127}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const object = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const time = (x: unknown): x is number | null =>
  x === null || (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0);

export interface ValidatedCalendarSnapshot {
  readonly contractVersion: 'hks_calendar_v1';
  readonly siteUid: string;
  readonly asOfUtcMs: number;
  readonly truncated: boolean;
  readonly calendar: UnifiedCalendar;
}

export function validateHakiSendCalendar(
  payload: unknown,
  expectedSiteUid: string,
  timezone: string,
): ValidatedCalendarSnapshot {
  if (!UUID.test(expectedSiteUid)) throw Error('Invalid expected Site identity.');
  if (!object(payload) || payload.success !== true || !object(payload.data)) {
    throw Error('Calendar API did not return a valid success envelope.');
  }
  if (Object.keys(payload).some(key => !PAYLOAD_KEYS.has(key))) {
    throw Error('Unexpected Calendar response envelope field.');
  }
  const d = payload.data;
  if (Object.keys(d).some(key => !SNAPSHOT_KEYS.has(key))) {
    throw Error('Unexpected Calendar snapshot field.');
  }
  if (d.contract_version !== 'hks_calendar_v1') {
    throw Error('Calendar API contract version differs from the client.');
  }
  if (d.site_uid !== expectedSiteUid || d.read_only !== true ||
      !time(d.as_of_utc_ms) || d.as_of_utc_ms === null ||
      typeof d.truncated !== 'boolean' || !Array.isArray(d.events) ||
      d.events.length > 300) {
    throw Error('Calendar API response is not a verified owner-scoped read.');
  }

  const events: CalendarSource[] = d.events.map((raw: unknown): CalendarSource => {
    if (!object(raw) || Object.keys(raw).some(key => !ALLOWED_FIELDS.has(key))) {
      throw Error('Unexpected calendar content field.');
    }
    if (typeof raw.uid !== 'string' || !UID.test(raw.uid) ||
        raw.siteUid !== expectedSiteUid ||
        !VALID_KINDS.has(raw.kind as CalendarKind) ||
        !STATUSES_BY_KIND[raw.kind as CalendarKind].has(raw.status as CalendarStatus) ||
        raw.serverConfirmed !== true || raw.sendAuthorized !== false ||
        !time(raw.scheduledAtUtcMs)) {
      throw Error('Calendar event identity, time or authorization is invalid.');
    }
    if (typeof raw.title !== 'string' || raw.title.length > 512 ||
        /[\0\r]/.test(raw.title)) {
      throw Error('Calendar event title is invalid.');
    }
    if (raw.kind === 'post') {
      if (raw.publicVisibility !== 'not_attested' ||
          'linkedPostUid' in raw || 'scheduleAuthorization' in raw ||
          !time(raw.postPublishAtUtcMs) || !time(raw.postUnpublishAtUtcMs) ||
          (raw.status === 'scheduled'
            ? raw.scheduledAtUtcMs === null ||
              raw.scheduledAtUtcMs !== raw.postPublishAtUtcMs
            : raw.scheduledAtUtcMs !== null)) {
        throw Error('Post authoring date must not claim public visibility or an unverified clock.');
      }
    }
    if (raw.kind === 'post_linked_email') {
      if (typeof raw.linkedPostUid !== 'string' ||
          !UID.test(raw.linkedPostUid)) {
        throw Error('Missing authorized Post linkage.');
      }
      if (raw.scheduleAuthorization !== 'not_attested' ||
          raw.scheduledAtUtcMs !== null ||
          'postPublishAtUtcMs' in raw || 'postUnpublishAtUtcMs' in raw ||
          'publicVisibility' in raw) {
        throw Error('Post-linked Email draft cannot have its own schedule.');
      }
    }
    if (raw.kind === 'standalone_email' &&
        (raw.scheduledAtUtcMs !== null ||
         'linkedPostUid' in raw || 'scheduleAuthorization' in raw ||
         'postPublishAtUtcMs' in raw || 'postUnpublishAtUtcMs' in raw ||
         'publicVisibility' in raw)) {
      throw Error('Standalone Draft cannot masquerade as scheduled mail.');
    }
    return {
      uid: raw.uid,
      kind: raw.kind as CalendarKind,
      siteUid: expectedSiteUid,
      status: raw.status as CalendarStatus,
      serverConfirmed: true,
      scheduledAtUtcMs: raw.scheduledAtUtcMs as number|null,
      ...(raw.kind === 'post_linked_email'
        ? {linkedPostUid: raw.linkedPostUid as string} : {}),
      title: raw.title,
      sendAuthorized: false,
      ...(raw.kind === 'post' ? {publicVisibility: 'not_attested' as const} : {}),
    };
  });
  return {
    contractVersion: 'hks_calendar_v1',
    siteUid: expectedSiteUid,
    asOfUtcMs: d.as_of_utc_ms,
    truncated: d.truncated,
    calendar: buildUnifiedCalendar(events,timezone),
  };
}

/** Construct the request but do not perform it; token stays out of URL. */
export function buildCalendarReadRequest(
  origin: string,
  siteUid: string,
  bearer: string,
  limit = 50,
): {method:'GET';url:string;headers:{Authorization:string;Accept:'application/json'}} {
  if (!UUID.test(siteUid)) throw Error('Invalid Site identity.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw Error('Invalid bounded Calendar page size.');
  }
  if (typeof bearer !== 'string' || bearer.length < 8 || bearer.length > 8192 ||
      /[\0\r\n]/.test(bearer)) {
    throw Error('Missing or unsafe bearer token.');
  }
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') {
    throw Error('Calendar API origin must be a plain HTTPS origin.');
  }
  const path = '/api/v1/hakisend/sites/'+encodeURIComponent(siteUid)+'/calendar';
  return {
    method:'GET',
    url: url.origin + path + '?limit=' + limit,
    headers:{Authorization:'Bearer '+bearer,Accept:'application/json'},
  };
}
