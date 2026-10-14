/**
 * Pure calendar projection. This module does not mutate server schedules.
 * All times are UTC epoch milliseconds; presentation converts to local timezone.
 */
export type CalendarKind = 'post' | 'post_linked_email' | 'standalone_email';
export type CalendarStatus = 'draft' | 'planned' | 'scheduled' | 'published' | 'sent' | 'failed' | 'cancelled' | 'ambiguous';
export interface CalendarSource {
  uid: string;
  kind: CalendarKind;
  siteUid: string;
  status: CalendarStatus;
  serverConfirmed: boolean;
  scheduledAtUtcMs: number | null;
  linkedPostUid?: string;
}
export interface CalendarEntry extends CalendarSource {
  effectiveAtUtcMs: number | null;
  blockedReason?: string;
}
const validTime = (n: number | null): boolean => n === null || (Number.isSafeInteger(n) && n >= 0);
export function projectCalendar(items: readonly CalendarSource[]): CalendarEntry[] {
  const posts = new Map<string, CalendarSource>();
  for (const item of items) {
    if (item.kind === 'post' && item.serverConfirmed) posts.set(item.siteUid + ':' + item.uid, item);
  }
  return items.map(item => {
    if (!validTime(item.scheduledAtUtcMs)) return {...item,effectiveAtUtcMs:null,blockedReason:'INVALID_TIME'};
    if (!item.serverConfirmed) return {...item,effectiveAtUtcMs:null,blockedReason:'UNCONFIRMED_LOCAL_STATE'};
    if (item.kind !== 'post_linked_email') return {...item,effectiveAtUtcMs:item.scheduledAtUtcMs};
    // A Post-linked Campaign still in draft is NOT enrolled for delivery.
    // Its linked Post clock must never fabricate a scheduled Email event.
    if (item.status === 'draft' || item.status === 'cancelled' || item.status === 'failed' || item.status === 'ambiguous') {
      return {...item,effectiveAtUtcMs:null,blockedReason:'LINKED_EMAIL_NOT_ENROLLED'};
    }
    if (!item.linkedPostUid) return {...item,effectiveAtUtcMs:null,blockedReason:'MISSING_LINKED_POST'};
    const post = posts.get(item.siteUid + ':' + item.linkedPostUid);
    if (!post) return {...item,effectiveAtUtcMs:null,blockedReason:'LINKED_POST_NOT_CONFIRMED'};
    if (post.status === 'cancelled' || post.status === 'failed') return {...item,effectiveAtUtcMs:null,blockedReason:'LINKED_POST_INACTIVE'};
    if (!validTime(post.scheduledAtUtcMs)) return {...item,effectiveAtUtcMs:null,blockedReason:'INVALID_LINKED_POST_TIME'};
    // Post-linked Email never owns a separate schedule. This is a calendar
    // projection only, not authorization to send on this date.
    return {...item,effectiveAtUtcMs:post.scheduledAtUtcMs};
  });
}
