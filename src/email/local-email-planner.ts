/**
 * Editable TypeScript port of the owner's v0.1.9 LOCAL Email Planner.
 * Source basis: source/main.js "HakiSend Email Planner M1" in the owner-tested
 * v0.1.9 test vault. No mail/provider, HTTP, publishing or background sync.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOT='HakiSend Emails';
const TITLE_MAX=160;
type EmailKind='standalone'|'post_linked_free';
type SendPolicy='now'|'scheduled'|'on_publication';

export interface LocalEmailPlannerInput {
  kind:EmailKind;
  siteUid:string;
  subject:string;
  listUid?:string;
  sendPolicy?:SendPolicy;
  scheduleInput?:string;
  sourceNote?:string;
  sourceSiteUid?:string;
  postUid?:string;
  isReadOnlySnapshot?:boolean;
}
export interface LocalEmailPlan {
  kind:EmailKind;
  siteUid:string;
  subject:string;
  listUid:string;
  status:'local_draft';
  sendPolicy:SendPolicy;
  scheduledAtUtc:string;
  sourceNote:string;
  postUid:string;
  storeOnHakisend:false;
  publishEmailArchive:false;
}
function required(s:unknown,label:string,max=TITLE_MAX):string{
  if(typeof s!=='string'||!s.trim()||s.length>max||
    /[\u0000-\u001f\u007f]/.test(s)){
    throw Error(label+' is required (max '+max+' characters)');
  }
  return s.trim();
}
function uuid(s:unknown,label:string):string{
  if(typeof s!=='string'||!UUID.test(s))throw Error('Invalid '+label);
  return s.toLowerCase();
}
function safeFilename(input:string):string{
  return input.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,' ')
    .replace(/^\.+|\.+$/g,'').replace(/\s+/g,' ').trim().slice(0,75)||'Email';
}

/**
 * An explicit ISO timezone is required; never assume the device's timezone.
 * Returns normalized UTC only as *local future intent*, not a server schedule.
 */
export function parseLocalEmailUtcSchedule(
  input:unknown,now:Date=new Date()
):string{
  const value=required(input,'Scheduled time',40);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value))
    throw Error('Use ISO 8601 with an explicit timezone offset.');
  const millis=Date.parse(value);
  if(!Number.isFinite(millis)||millis<=now.getTime())
    throw Error('Scheduled time must be valid and in the future.');
  // Validate the calendar date and timezone offset round-trip. Date.parse()
  // normalizes invalid calendar dates (e.g. February 30) on some runtimes.
  const matched=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if(!matched)throw Error('Invalid ISO email schedule.');
  const year=Number(matched[1]),month=Number(matched[2]),day=Number(matched[3]);
  const hh=Number(matched[4]),mm=Number(matched[5]),ss=Number(matched[6]??0);
  if(year<2000||month<1||month>12||day<1||day>31||hh>23||mm>59||ss>59 ||
    day>new Date(Date.UTC(year,month,0)).getUTCDate())
    throw Error('Invalid calendar date or local clock.');
  const zone=matched[7];
  if(zone!=='Z'&&Math.abs(Number(zone.slice(1,3))*60+Number(zone.slice(4,6)))>14*60)
    throw Error('Invalid timezone offset.');
  return new Date(millis).toISOString();
}

export function normalizeLocalEmailPlan(
  input:LocalEmailPlannerInput,now:Date=new Date()
):LocalEmailPlan{
  if(!input || (input.kind!=='standalone'&&input.kind!=='post_linked_free'))
    throw Error('Choose a valid Email type.');
  const siteUid=uuid(input.siteUid,'Site UID');
  const subject=required(input.subject,'Email subject');
  const listUid=String(input.listUid??'').trim();
  if(listUid&&!/^[A-Za-z0-9_-]{1,128}$/.test(listUid))
    throw Error('Audience list UID contains unsupported characters.');
  const result:LocalEmailPlan={
    kind:input.kind,siteUid,subject,listUid:listUid.toLowerCase(),
    status:'local_draft',sendPolicy:'now',scheduledAtUtc:'',
    sourceNote:'',postUid:'',storeOnHakisend:false,publishEmailArchive:false,
  };
  if(input.kind==='post_linked_free'){
    if(input.sourceSiteUid &&
       uuid(input.sourceSiteUid,'source Post Site UID')!==siteUid)
      throw Error('The selected Site differs from the source Post pinned Site.');
    const path=required(input.sourceNote,'Source Post note',1024);
    if(!path.endsWith('.md')||path.startsWith('HakiSend Imports/')||
      path.startsWith(ROOT+'/')||path.startsWith('/')||path.includes('\\')||
      path.split('/').includes('..')){
      throw Error('Choose an editable Post note outside imported snapshots.');
    }
    if(input.isReadOnlySnapshot)
      throw Error('Read-only HakiSend snapshot cannot be a Post-linked email source.');
    if(input.postUid)result.postUid=uuid(input.postUid,'Post UID');
    if(input.sendPolicy && input.sendPolicy!=='on_publication')
      throw Error('Post-linked email can only follow publication.');
    if(input.scheduleInput)
      throw Error('Post-linked email cannot have an independent send time.');
    result.sourceNote=path;
    result.sendPolicy='on_publication';
  }else{
    if(input.sourceNote||input.postUid)
      throw Error('Standalone email must not publish or reference a Post.');
    if(input.sendPolicy!=='now'&&input.sendPolicy!=='scheduled')
      throw Error('Standalone email requires a local send policy.');
    result.sendPolicy=input.sendPolicy;
    if(input.sendPolicy==='scheduled')
      result.scheduledAtUtc=parseLocalEmailUtcSchedule(input.scheduleInput,now);
    else if(input.scheduleInput)
      throw Error('Send-now email cannot have a schedule.');
  }
  return result;
}

export function serializeLocalEmailPlan(draft:LocalEmailPlan):string{
  // Serialize validated input only: JSON string scalars are valid YAML
  // double-quoted strings and cannot inject additional frontmatter fields.
  const q=(s:string)=>JSON.stringify(s);
  const lines=[
    '---','hakisend_type: email_campaign',
    'hakisend_email_kind: '+q(draft.kind),
    'site_uid: '+q(draft.siteUid),
    'email_subject: '+q(draft.subject),
    'email_list_uid: '+q(draft.listUid),
    'email_send_policy: '+q(draft.sendPolicy),
    'email_scheduled_at_utc: '+q(draft.scheduledAtUtc),
    'email_source_note: '+q(draft.sourceNote),
    'email_source_post_uid: '+q(draft.postUid),
    'email_store_on_hakisend: false','email_publish_archive: false',
    'email_dispatch_ready: false','hakisend_local_only: true',
    'hakisend_status: '+q('local_draft'),'---','',
    '# '+draft.subject,'',
    '> [!warning] Email plan — local draft, NOT sent or scheduled on HakiSend',
    '> Authoring only. No recipient lookup, public archive or email dispatch happens from this note.','',
  ];
  if(draft.kind==='post_linked_free'){
    lines.push('Source Post: '+q(draft.sourceNote),'',
      'The free excerpt is determined on HakiSend after the Post is actually public. Do not paste member-only content.','',
      'Linked Email follows verified Post publication and has no independent delivery schedule.','',
      '## Email introduction (optional)','','');
  }else{
    lines.push('## Email body','',
      'Write the standalone email here. Before dispatch, HakiSend must verify recipient consent, suppression, sender identity, unsubscribe, quota and receipts.','');
  }
  return lines.join('\n');
}

/** Local file paths only; caller creates folders and file in the Vault. */
export function localEmailPlanPaths(
  siteUid:string,kind:EmailKind,title:string
):{root:string;directory:string;basename:string}{
  const site=uuid(siteUid,'Site UID');
  if(kind!=='standalone'&&kind!=='post_linked_free')
    throw Error('Invalid Email Plan type.');
  return {root:ROOT,directory:ROOT+'/'+site,
    basename:(kind==='standalone'?'Email':'Post Email')+' - '+safeFilename(required(title,'Email subject'))};
}

/** Read source context from current editable Post metadata; no network. */
export function localEmailSourceContext(
  path:string|null,extension:string|null,
  metadata:Record<string,unknown>={}
):{sourceNote:string;postUid:string;sourceSiteUid:string;isReadOnlySnapshot:boolean}{
  if(!path||extension!=='md')
    return {sourceNote:'',postUid:'',sourceSiteUid:'',isReadOnlySnapshot:false};
  return {
    sourceNote:path,
    postUid:typeof metadata.post_uid==='string'?metadata.post_uid:
      typeof metadata.hakisend_post_uid==='string'?metadata.hakisend_post_uid:'',
    sourceSiteUid:typeof metadata.site_uid==='string'?metadata.site_uid:'',
    isReadOnlySnapshot:metadata.hakisend_import_snapshot===true||
      metadata.hakisend_read_only===true,
  };
}
