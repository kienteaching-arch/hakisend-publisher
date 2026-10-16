/**
 * Unified Calendar CANDIDATE. Never schedules, sends or edits an event.
 * All times are absolute UTC epoch ms; local-day grouping uses IANA zones.
 * No calendar event is a delivery authorization.
 */
import {projectCalendar, type CalendarSource, type CalendarEntry} from './calendar-projection.ts';

export interface CalendarDay {
  localDate: string;
  entries: CalendarEntry[];
  overlappingServerTimes: string[];
}
export interface UnifiedCalendar {
  timezone: string;
  days: CalendarDay[];
  unscheduled: CalendarEntry[];
  blocked: CalendarEntry[];
  serverConfirmedCount: number;
  tentativeCount: number;
}
const uid = (e: CalendarSource): string => [e.kind,e.siteUid,e.uid].join(':');
const allowedStatus = new Set(['draft','planned','scheduled','published','sent','failed','cancelled','ambiguous']);

function localDay(ms: number, tz: string): string {
  const f=new Intl.DateTimeFormat('en-CA',{
    timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',
  });
  const parts=f.formatToParts(new Date(ms));
  const get=(kind:string)=>parts.find(p=>p.type===kind)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function buildUnifiedCalendar(items: readonly CalendarSource[], timezone: string): UnifiedCalendar {
  if(!timezone || timezone.length>128) throw Error('Missing or oversized timezone.');
  try { new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(); }
  catch { throw Error('Invalid IANA timezone.'); }
  const ids=new Set<string>();
  for(const item of items){
    if(!item.siteUid || !item.uid || !allowedStatus.has(item.status))
      throw Error('Invalid calendar identity or status.');
    const id=uid(item);
    if(ids.has(id)) throw Error('Duplicate calendar event identity.');
    ids.add(id);
  }
  const projected=projectCalendar(items);
  const grouped=new Map<string,CalendarEntry[]>();
  const unscheduled:CalendarEntry[]=[];
  const blocked:CalendarEntry[]=[];
  for(const event of projected){
    if(event.blockedReason || !event.serverConfirmed){
      blocked.push(event);continue;
    }
    if(event.effectiveAtUtcMs===null){unscheduled.push(event);continue;}
    const date=localDay(event.effectiveAtUtcMs,timezone);
    const day=grouped.get(date)??[];
    day.push(event);grouped.set(date,day);
  }
  const days=[...grouped.entries()].sort(([a],[b])=>a.localeCompare(b))
    .map(([date,entries])=>{
      entries.sort((a,b)=>(a.effectiveAtUtcMs??0)-(b.effectiveAtUtcMs??0)
        || uid(a).localeCompare(uid(b)));
      // Conflict marker is *advisory*, never a trigger to schedule/send.
      const seen=new Map<string,number>();
      for(const event of entries){
        if(event.status==='cancelled' || event.status==='failed')continue;
        const time=String(event.effectiveAtUtcMs);
        seen.set(time,(seen.get(time)??0)+1);
      }
      return {
        localDate:date, entries,
        overlappingServerTimes:[...seen].filter(([,n])=>n>1).map(([k])=>k),
      };
    });
  return {
    timezone,days,unscheduled,blocked,
    serverConfirmedCount:items.filter(x=>x.serverConfirmed).length,
    tentativeCount:items.filter(x=>!x.serverConfirmed).length,
  };
}
