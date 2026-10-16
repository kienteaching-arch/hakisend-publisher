/**
 * Explicit read-only Calendar v2 pagination contract.
 *
 * Each page is independently validated against the strict Calendar v1
 * SOURCE schema after removing only versioned paging metadata. This adapter
 * cannot schedule, publish, sync, send or grant delivery permission.
 */
import {
  buildCalendarReadRequest,validateHakiSendCalendar,
  type ValidatedCalendarSnapshot
} from './server-calendar-contract.ts';

const CURSOR=/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/;
const KEYS=new Set([
  'contract_version','site_uid','as_of_utc_ms','truncated',
  'read_only','events','next_cursor'
]);
const isRecord=(value:unknown):value is Record<string,unknown> =>
  value!==null && typeof value==='object' && !Array.isArray(value);

export interface CalendarPageSession {
  readonly siteUid:string;
  readonly asOfUtcMs:number;
  readonly pages:readonly ValidatedCalendarSnapshot[];
  readonly seenIdentities:readonly string[];
  readonly nextCursor:string|null;
}

/**
 * Cursor is a server-issued opaque URL query value, never an OAuth bearer.
 * The server must verify its HMAC, owner/Site scope and expiry on EVERY page.
 */
export function buildCalendarPageRequest(
  origin:string,siteUid:string,bearer:string,
  limit=50,cursor:string|null=null,
):ReturnType<typeof buildCalendarReadRequest>{
  const base=buildCalendarReadRequest(origin,siteUid,bearer,limit);
  if(cursor!==null && (typeof cursor!=='string' || cursor.length>2048 ||
    !CURSOR.test(cursor))){
    throw Error('Invalid Calendar continuation cursor.');
  }
  return {
    ...base,
    url:base.url.replace('/calendar?limit=','/calendar/pages?limit=')
      +(cursor===null?'':'&cursor='+encodeURIComponent(cursor)),
  };
}

/**
 * Maintain an explicitly user-requested traversal. No background loop:
 * callers show nextCursor and require a separate deliberate Load More click.
 * A page changing Site/as-of, replaying identities, or forging a delivery
 * claim is rejected before becoming visible.
 */
export function acceptCalendarPage(
  response:unknown,
  expectedSiteUid:string,timezone:string,
  prior:CalendarPageSession|null=null,
):CalendarPageSession{
  if(!isRecord(response) || response.success!==true ||
    !isRecord(response.data) ||
    Object.keys(response).some(k=>k!=='success'&&k!=='data')){
    throw Error('Invalid Calendar v2 response envelope.');
  }
  const d=response.data;
  if(Object.keys(d).some(k=>!KEYS.has(k)) ||
     d.contract_version!=='hks_calendar_v2' ||
     typeof d.truncated!=='boolean' ||
     !Array.isArray(d.events) || d.events.length>100 ||
     !(d.next_cursor===null ||
        (typeof d.next_cursor==='string' &&
         d.next_cursor.length<=2048 && CURSOR.test(d.next_cursor))) ||
     (d.truncated ? d.next_cursor===null || d.events.length===0
                  : d.next_cursor!==null)){
    throw Error('Unsafe or incomplete Calendar v2 page.');
  }
  if(prior && (prior.siteUid!==expectedSiteUid ||
      prior.nextCursor===null || prior.pages.length>=500)){
    throw Error('Calendar continuation was not explicitly available.');
  }
  // This is a deliberate field projection, not object spread: unknown
  // recipient/owner/private body metadata cannot bypass v1 validation.
  const validated=validateHakiSendCalendar({
    success:true,
    data:{
      contract_version:'hks_calendar_v1',
      site_uid:d.site_uid,as_of_utc_ms:d.as_of_utc_ms,
      truncated:d.truncated,read_only:d.read_only,events:d.events,
    },
  },expectedSiteUid,timezone);
  if(prior && prior.asOfUtcMs!==validated.asOfUtcMs){
    throw Error('Calendar snapshot clock changed between pages.');
  }
  if(prior && prior.nextCursor===d.next_cursor){
    throw Error('Calendar cursor did not advance.');
  }
  const keys=new Set(prior?.seenIdentities??[]);
  for(const event of d.events){
    if(!isRecord(event))throw Error('Invalid Calendar event.');
    const key=String(event.kind)+':'+String(event.siteUid)+':'+String(event.uid);
    if(keys.has(key))throw Error('Duplicate Calendar record between pages.');
    keys.add(key);
  }
  return {
    siteUid:expectedSiteUid,
    asOfUtcMs:validated.asOfUtcMs,
    pages:[...(prior?.pages??[]),validated],
    seenIdentities:[...keys],
    nextCursor:d.next_cursor as string|null,
  };
}
