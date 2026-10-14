/**
 * Adapter for the PRIVATE HakiSend Laravel hks_calendar_v1 read-only JSON.
 * Data is trusted only after the server has authenticated the Site owner;
 * this client STILL verifies the response contract and rejects unsafe states.
 * No scheduling, send, publish or file-write behavior lives here.
 */
import type {CalendarSource} from './calendar-projection.ts';
import {buildUnifiedCalendar, type UnifiedCalendar} from './unified-calendar.ts';

export interface VerifiedCalendarFeed {
  siteUid: string;
  asOfUtcMs: number;
  truncated: boolean;
  items: CalendarSource[];
}
const STATUSES = new Set(['draft','planned','scheduled','published','sent','failed','cancelled','ambiguous']);
const KINDS = new Set(['post','post_linked_email','standalone_email']);
type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const validMs = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
const textValue = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256;

export function parseHakiSendCalendarV1(
  response: unknown, expectedSiteUid: string,
): VerifiedCalendarFeed {
  if (!textValue(expectedSiteUid) || !object(response) || response.success !== true ||
      !object(response.data)) throw Error('Calendar server response unavailable.');
  const data = response.data;
  if (data.contract_version !== 'hks_calendar_v1' ||
      data.site_uid !== expectedSiteUid || data.read_only !== true ||
      typeof data.truncated !== 'boolean' ||
      !validMs(data.as_of_utc_ms) || data.as_of_utc_ms === null ||
      !Array.isArray(data.events) || data.events.length > 300) {
    throw Error('Unsupported or non-authoritative Calendar response.');
  }
  const items: CalendarSource[] = [];
  const used = new Set<string>();
  for (const source of data.events) {
    if (!object(source) || !textValue(source.uid) ||
        source.siteUid !== expectedSiteUid ||
        !KINDS.has(source.kind as string) ||
        !STATUSES.has(source.status as string) ||
        source.serverConfirmed !== true ||
        source.sendAuthorized !== false ||
        !validMs(source.scheduledAtUtcMs) ||
        !textValue(source.title)) {
      throw Error('Unsafe Calendar event source.');
    }
    const key = `${source.kind}:${source.siteUid}:${source.uid}`;
    if (used.has(key)) throw Error('Duplicate Calendar event.');
    used.add(key);
    if (source.kind === 'post_linked_email') {
      if (!textValue(source.linkedPostUid) ||
          source.scheduledAtUtcMs !== null ||
          !['draft','ambiguous'].includes(source.status as string)) {
        throw Error('Unattested Post-linked Email delivery time.');
      }
    }
    if (source.kind === 'standalone_email' &&
        source.status === 'draft' && source.scheduledAtUtcMs !== null) {
      throw Error('Private Standalone Draft must not claim a schedule.');
    }
    // Do not pass through arbitrary extra JSON properties (customer data,
    // private content, editable flags or hypothetical send authorization).
    items.push({
      uid:source.uid as string,
      kind:source.kind as CalendarSource['kind'],
      siteUid:expectedSiteUid,
      status:source.status as CalendarSource['status'],
      serverConfirmed:true,
      scheduledAtUtcMs:source.scheduledAtUtcMs as number | null,
      title:source.title as string,
      ...(source.kind === 'post_linked_email'
        ? {linkedPostUid:source.linkedPostUid as string} : {}),
      sendAuthorized:false,
    });
  }
  return {
    siteUid:expectedSiteUid,
    asOfUtcMs:data.as_of_utc_ms,
    truncated:data.truncated,
    items,
  };
}
export function projectVerifiedServerCalendar(
  response: unknown, expectedSiteUid: string, timezone: string,
): UnifiedCalendar {
  const feed=parseHakiSendCalendarV1(response,expectedSiteUid);
  return buildUnifiedCalendar(feed.items,timezone);
}
