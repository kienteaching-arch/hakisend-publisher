/**
 * Read-only LOCAL planning calendar, not server Calendar or actual schedule.
 * Never treats a local_draft as a provider-scheduled or published event.
 */
import type {R3Kind,R3Plan} from './r3-distribution-contract';

const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const KINDS=new Set<R3Kind>(['site_post','post_free_email','standalone_email','facebook_page_post']);
export interface R3LocalCalendarEntry{
 readonly siteUid:string;
 readonly kind:R3Kind;
 readonly title:string;
 readonly destinationLabel:string;
 readonly destinationUid:string;
 readonly scheduledAtUtc:string|null;
 readonly status:'local_draft';
 readonly planPath:string;
}
function obj(x:unknown):x is Record<string,unknown>{
 return !!x&&typeof x==='object'&&!Array.isArray(x);
}
export function readR3LocalPlanNote(note:string):R3Plan{
 if(typeof note!=='string'||note.length>1800000)
   throw Error('Untrusted or oversized distribution plan document.');
 const fence=String.fromCharCode(96).repeat(3);
 const first=note.indexOf(fence+'json\n');
 if(first<0||note.indexOf(fence+'json\n',first+1)>=0)
   throw Error('Missing or repeated plan JSON section.');
 const from=first+fence.length+5;
 const end=note.lastIndexOf('\n'+fence);
 if(end<=from)throw Error('Unclosed plan JSON section.');
 let data:unknown;
 try{data=JSON.parse(note.slice(from,end));}
 catch{throw Error('Malformed multichannel plan JSON.');}
 if(!obj(data)||data.schema!=='hks_r3_multichannel_plan_v1'||
  data.status!=='local_only'||!UUID.test(String(data.siteUid))||
  !['post','email_only'].includes(String(data.mode))||
  typeof data.sourceNote!=='string'||!Array.isArray(data.events)||
  data.events.length>55||!Array.isArray(data.warnings))
   throw Error('Invalid or potentially executable plan.');
 const site=data.siteUid as string;
 for(const row of data.events){
  if(!obj(row)||row.status!=='local_draft'||row.siteUid!==site||
   !KINDS.has(row.kind as R3Kind)||typeof row.title!=='string'||
   typeof row.destinationUid!=='string'||typeof row.destinationLabel!=='string'||
   (row.scheduledAtUtc!==null&&
    (typeof row.scheduledAtUtc!=='string'||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.scheduledAtUtc)))||
   typeof row.body!=='string')throw Error('Invalid local Calendar event.');
  if(data.mode==='email_only'&&row.kind!=='standalone_email')
   throw Error('Email Only note contains an unrelated publishing action.');
 }
 return data as unknown as R3Plan;
}
export function r3LocalCalendar(
 notes:readonly {path:string;markdown:string}[],
 siteFilter='all',
 kindFilter:R3Kind|'all'='all'
):{entries:readonly R3LocalCalendarEntry[];invalidDocuments:number}{
 if(notes.length>500)throw Error('Too many local distribution documents.');
 if(siteFilter!=='all'&&!UUID.test(siteFilter))throw Error('Unknown Calendar Site filter.');
 if(kindFilter!=='all'&&!KINDS.has(kindFilter))throw Error('Unknown Calendar event type.');
 const entries:R3LocalCalendarEntry[]=[];let invalidDocuments=0;
 for(const note of notes){
  if(!note||typeof note.path!=='string'||
    !note.path.startsWith('HakiSend Distribution Plans/')||!note.path.endsWith('.md')){
    invalidDocuments++;continue;
  }
  try{
   const p=readR3LocalPlanNote(note.markdown);
   for(const e of p.events){
    if((siteFilter==='all'||e.siteUid===siteFilter)&&
       (kindFilter==='all'||e.kind===kindFilter))
     entries.push({siteUid:e.siteUid,kind:e.kind,title:e.title,
      destinationUid:e.destinationUid,destinationLabel:e.destinationLabel,
      scheduledAtUtc:e.scheduledAtUtc,status:'local_draft',planPath:note.path});
   }
  }catch{invalidDocuments++;}
 }
 // Plans without a future time sort after the scheduled drafts. Never invent a timestamp.
 entries.sort((a,b)=>(a.scheduledAtUtc??'9999').localeCompare(b.scheduledAtUtc??'9999')||
   a.siteUid.localeCompare(b.siteUid)||a.title.localeCompare(b.title));
 return {entries,invalidDocuments};
}
