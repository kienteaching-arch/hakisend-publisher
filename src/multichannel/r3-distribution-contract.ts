/**
 * R3 MULTICHANNEL SOURCE CONTRACT. LOCAL-only, no publishing, scheduling or sending.
 * Site UID is email ownership, not an implied Site Post.
 * Facebook Page never inherits HakiSend Site credentials.
 */
import {extractStandaloneEmailBody} from '../email/private-draft-contract.ts';
export type R3Kind='site_post'|'post_free_email'|'standalone_email'|'facebook_page_post';
export type R3Mode='post'|'email_only';
export interface R3ListTarget{
  listUid:string;templateRef:string;subject:string;preheader?:string;scheduledAt?:string;
}
export interface R3PageTarget{pageId:string;pageName:string;scheduledAt?:string}
export interface R3Input{
  mode:R3Mode;siteUid:string;notePath:string;title:string;markdown:string;
  postScheduledAt?:string;lists:readonly R3ListTarget[];pages:readonly R3PageTarget[];
}
export interface R3Event{
  kind:R3Kind;siteUid:string;destinationUid:string;destinationLabel:string;
  title:string;body:string;scheduledAtUtc:string|null;status:'local_draft';
  templateRef?:string;preheader?:string;sourceNote?:string;
}
export interface R3Plan{
  schema:'hks_r3_multichannel_plan_v1';status:'local_only';siteUid:string;
  mode:R3Mode;sourceNote:string;events:readonly R3Event[];warnings:readonly string[];
}
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const LIST=/^[A-Za-z0-9_.:-]{3,191}$/;
const PAGE=/^[1-9][0-9]{4,24}$/;
const TEMPLATE=/^[A-Za-z0-9_.:/-]{2,191}$/;
const FREE_START='<!-- hakisend:free:start -->';
const FREE_END='<!-- hakisend:free:end -->';
function requireField(x:unknown,name:string,max=255):string{
 if(typeof x!=='string'||!x.trim()||x.length>max||/[\x00-\x1f\x7f]/.test(x))
   throw Error('Invalid '+name);
 return x.trim();
}
function requirePath(x:unknown,mode:R3Mode):string{
 const v=requireField(x,'editable Markdown path',1024);
 if(!v.endsWith('.md')||v.startsWith('/')||v.includes('\\')||
 v.split('/').some(p=>!p||p==='.'||p==='..')||
 v.startsWith('HakiSend Imports/')||
 (mode!=='email_only'&&v.startsWith('HakiSend Emails/')))
   throw Error('Source must be an editable Markdown note, not an imported snapshot.');
 return v;
}
export function stripR3Frontmatter(raw:string):string{
 if(typeof raw!=='string'||raw.length>250000||raw.includes('\0'))
   throw Error('Invalid Markdown source.');
 const text=raw.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 if(!text.startsWith('---\n'))return text.trim();
 const end=text.indexOf('\n---\n',4);
 if(end<0)throw Error('Unclosed YAML frontmatter.');
 return text.slice(end+5).trim();
}
/**
 * Authoring-only preview: does NOT assert the HTML/guest visibility of
 * a HakiSend post. Backend MUST re-attest visibility before real send.
 */
export function extractMarkedFreeBlock(raw:string):string{
 const lines=stripR3Frontmatter(raw).split('\n');
 let start=-1,end=-1,fence=false,invalidFence=false;
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();
  if(line.startsWith(String.fromCharCode(96).repeat(3))||line.startsWith('~~~'))fence=!fence;
  if(line.includes('hakisend:free:')){
    if(fence)invalidFence=true;
    if(line===FREE_START){
      if(start>=0||end>=0)throw Error('Duplicate/misplaced Free start marker.');
      start=i;
    }else if(line===FREE_END){
      if(start<0||end>=0)throw Error('Unbalanced Free end marker.');
      end=i;
    }else throw Error('Malformed Free content marker.');
  }
 }
 if(invalidFence||fence)throw Error('Ambiguous Free marker inside Markdown code fence.');
 if(start<0||end<=start)throw Error('Post Free Email requires exactly one explicit Free block.');
 const free=lines.slice(start+1,end).join('\n').trim();
 if(!free)throw Error('Free block cannot be empty.');
 if(/<!--\s*(?:hakisend:(?:paid|premium|member)|members?[-_: ]only|paywall)\b/i.test(free))
   throw Error('Paid/membership marker found inside Free block.');
 return free;
}
export function r3UtcSchedule(when?:string,now:Date=new Date()):string|null{
 if(when===undefined||when==='')return null;
 const m=typeof when==='string'?/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(when):null;
 if(!m)throw Error('Schedule requires ISO 8601 with explicit timezone.');
 const yr=+m[1],mo=+m[2],day=+m[3],hh=+m[4],min=+m[5],sec=+(m[6]??0);
 const z=m[7],oh=z==='Z'?0:+z.slice(1,3),om=z==='Z'?0:+z.slice(4,6);
 if(yr<2020||mo<1||mo>12||day<1||day>new Date(Date.UTC(yr,mo,0)).getUTCDate()||
 hh>23||min>59||sec>59||oh*60+om>840)throw Error('Invalid calendar date or timezone.');
 const ms=Date.parse(when);
 if(!Number.isFinite(ms)||ms<=now.getTime())throw Error('Schedule must be in the future.');
 return new Date(ms).toISOString();
}
export function createR3LocalPlan(input:R3Input,now:Date=new Date()):R3Plan{
 if(!input||(input.mode!=='post'&&input.mode!=='email_only')||
 !Array.isArray(input.lists)||input.lists.length>20||
 !Array.isArray(input.pages)||input.pages.length>30)
   throw Error('Invalid R3 plan or destination count.');
 const id=requireField(input.siteUid,'Site UID',36).toLowerCase();
 if(!UUID.test(id))throw Error('Invalid Site UID.');
 const note=requirePath(input.notePath,input.mode);
 let body=stripR3Frontmatter(input.markdown);
 if(input.mode==='email_only'&&note.startsWith('HakiSend Emails/')){
   if(!/^hakisend_email_kind:\s*["']?standalone["']?\s*$/m.test(input.markdown))
     throw Error('Only Standalone Email Plans can be used as Email Only source.');
   body=extractStandaloneEmailBody(input.markdown);
   if(!body||body.includes('Write the standalone email here.'))
     throw Error('Replace the standalone email body placeholder.');
 }
 const title=requireField(input.title,'Post or email title',200);
 if(!body)throw Error('Empty Markdown source.');
 if(input.mode==='email_only'&&(input.postScheduledAt||input.pages.length>0))
   throw Error('Email Only may not publish a Post or Facebook Page.');
 const events:R3Event[]=[];
 if(input.mode==='post')events.push({kind:'site_post',siteUid:id,destinationUid:id,
  destinationLabel:'HakiSend Site',title,body,sourceNote:note,
  scheduledAtUtc:r3UtcSchedule(input.postScheduledAt,now),status:'local_draft'});
 const free=input.mode==='post'&&(input.lists.length||input.pages.length)?extractMarkedFreeBlock(input.markdown):'';
 const lists=new Set<string>();
 for(const row of input.lists){
  const list=requireField(row.listUid,'Email List UID',191);
  if(!LIST.test(list)||lists.has(list.toLowerCase()))throw Error('Invalid/duplicate Email List UID.');
  lists.add(list.toLowerCase());
  const template=requireField(row.templateRef,'Email template reference',191);
  if(!TEMPLATE.test(template))throw Error('Invalid Email template reference.');
  const sub=requireField(row.subject,'Email subject');
  const pre=row.preheader??'';
  if(typeof pre!=='string'||pre.length>255||/[\r\n\0]/.test(pre))
    throw Error('Invalid Email preview text.');
  events.push({kind:input.mode==='post'?'post_free_email':'standalone_email',
    siteUid:id,destinationUid:list,destinationLabel:list,title:sub,
    body:input.mode==='post'?free:body,templateRef:template,preheader:pre,
    status:'local_draft',scheduledAtUtc:r3UtcSchedule(row.scheduledAt,now),
    ...(input.mode==='post'?{sourceNote:note}:{})});
 }
 const pages=new Set<string>();
 for(const row of input.pages){
  const page=requireField(row.pageId,'Facebook Page ID',25);
  if(!PAGE.test(page)||pages.has(page))throw Error('Invalid/duplicate Facebook Page ID.');
  pages.add(page);
  events.push({kind:'facebook_page_post',siteUid:id,destinationUid:page,
   destinationLabel:requireField(row.pageName,'Facebook Page name',160),
   title,body:free,sourceNote:note,status:'local_draft',
   scheduledAtUtc:r3UtcSchedule(row.scheduledAt,now)});
 }
 if(input.mode==='email_only'&&!events.length)throw Error('Select an Email List for Email Only.');
 return {schema:'hks_r3_multichannel_plan_v1',status:'local_only',siteUid:id,
 mode:input.mode,sourceNote:note,events,warnings:[
  'LOCAL ONLY: no real scheduling, posting or email delivery is performed.',
  'Post Free must be rechecked against guest-visible server content before dispatch.',
  'Each Email List template, sender permission and recipient consent needs server verification.',
  'Each Facebook Page requires its own valid backend-managed Page access token.'
 ]};
}
export function renderR3LocalPlan(plan:R3Plan):string{
 if(plan.schema!=='hks_r3_multichannel_plan_v1'||plan.status!=='local_only')
  throw Error('Unsafe distribution plan.');
 const fence=String.fromCharCode(96).repeat(3);
 return '# HakiSend R3 — Distribution Plan\n\n'+
 '> [!warning] Local plan only — nothing has been sent, posted or scheduled.\n\n'+
 fence+'json\n'+JSON.stringify(plan,null,2)+'\n'+fence+'\n';
}
