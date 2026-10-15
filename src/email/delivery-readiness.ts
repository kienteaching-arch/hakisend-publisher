/**
 * Manual, read-only Email delivery readiness snapshot.
 * An Acelle NEW draft is not evidence of consent, valid unsubscribe, quota,
 * suppression or verified provider state. The API intentionally NEVER
 * permits sending/scheduling. The backend route is candidate-only, flag OFF.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACELLE_UID=/^[0-9a-f]{13}$/;
const CHECKS=[
  'source_is_private_draft','owner_and_site_verified',
  'audience_bound_and_readable','native_campaign_ownership_verified',
  'native_campaign_unscheduled_new','native_campaign_single_list',
  'sender_identity_verified','uploaded_template_owned',
  'native_unsubscribe_markup_present',
] as const;
const COMPLIANCE=[
  'unsubscribe','consent','suppression','quota','provider',
  'scheduled_state_receipt','idempotency_handoff','source_revision_at_promotion',
] as const;
type Check=typeof CHECKS[number];
type Guard=typeof COMPLIANCE[number];

export interface AudienceStatusCounts {
  subscribed:number;unsubscribed:number;blacklisted:number;
  spam_reported:number;unconfirmed:number;other:number;total:number;
  source:'owner_list_status_snapshot';
  consent_verified:false;suppression_verified:false;
}
const STATUS_KEYS=['subscribed','unsubscribed','blacklisted','spam_reported',
  'unconfirmed','other'] as const;
export interface BlacklistOverlap {
  source:'acelle_owner_list_blacklist_overlap_v1';
  subscribed_total:number;
  owner_blacklist_overlap:number;
  global_blacklist_overlap:number;
  either_blacklist_overlap:number;
  without_either_blacklist_overlap:number;
  global_blacklist_policy:'unverified';
  suppression_verified:false;
  recipient_send_authorized:false;
}
export interface DeliveryReadiness {
  contract_version:'hks_delivery_readiness_v1';
  site_uid:string;
  draft_uid:string;
  request_uid:string;
  campaign_uid:string;
  campaign_state:'new'|'ambiguous';
  checks:Record<Check,boolean>;
  audience_status_counts:AudienceStatusCounts;
  blacklist_overlap:BlacklistOverlap;
  compliance:Record<Guard,'unverified'>;
  ready_to_send:false;
  send_authorized:false;
  schedule_authorized:false;
  read_only:true;
}
type Request={
  method:'GET';url:string;headers:{Accept:'application/json';Authorization:string};throw:false;
};
const obj=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
function sameUid(value:unknown,expected:string,pattern:RegExp):boolean {
  return typeof value==='string'&&pattern.test(value)&&value.toLowerCase()===expected.toLowerCase();
}
export function buildReadinessRequest(
  origin:string,siteUid:string,draftUid:string,requestUid:string,token:string
):Request {
  const url=new URL(origin);
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||
     url.pathname!=='/'||url.search||url.hash)throw Error('Plain HTTPS HakiSend API origin required.');
  if(!UUID.test(siteUid)||!UUID.test(draftUid)||!UUID.test(requestUid))
    throw Error('Invalid Site/Private Draft/request UID.');
  if(typeof token!=='string'||token.length<8||token.length>8192||/[\r\n\0]/.test(token))
    throw Error('Authorized bearer token required.');
  return {
    url:url.origin+'/api/v1/hakisend/sites/'+siteUid.toLowerCase()
      +'/emails/drafts/'+draftUid.toLowerCase()+'/campaign-drafts/'
      +requestUid.toLowerCase()+'/readiness',
    method:'GET',headers:{Accept:'application/json',Authorization:'Bearer '+token},
    throw:false,
  };
}
export function parseDeliveryReadiness(
  envelope:unknown,siteUid:string,draftUid:string,requestUid:string,
  expectedAcelleUid:string
):DeliveryReadiness {
  if(!UUID.test(siteUid)||!UUID.test(draftUid)||!UUID.test(requestUid)||
     !ACELLE_UID.test(expectedAcelleUid))throw Error('Invalid expected identities.');
  if(!obj(envelope)||envelope.success!==true||!obj(envelope.data)){
    throw Error('Readiness unavailable or not owner verified.');
  }
  const d=envelope.data;
  if(d.contract_version!=='hks_delivery_readiness_v1'||
     !sameUid(d.site_uid,siteUid,UUID)||
     !sameUid(d.draft_uid,draftUid,UUID)||
     !sameUid(d.request_uid,requestUid,UUID)||
     !sameUid(d.campaign_uid,expectedAcelleUid,ACELLE_UID)||
     !['new','ambiguous'].includes(String(d.campaign_state))||
     d.ready_to_send!==false||d.send_authorized!==false||
     d.schedule_authorized!==false||d.read_only!==true||
     !obj(d.checks)||!obj(d.compliance)||!obj(d.audience_status_counts)||
     !obj(d.blacklist_overlap)||
     Object.keys(d.checks).length!==CHECKS.length||
     Object.keys(d.compliance).length!==COMPLIANCE.length) {
    throw Error('Unexpected or unsafe delivery readiness evidence.');
  }
  const counts=d.audience_status_counts;
  if(counts.source!=='owner_list_status_snapshot'||
     counts.consent_verified!==false||counts.suppression_verified!==false||
     Object.keys(counts).length!==10||!Number.isSafeInteger(counts.total)||
     (counts.total as number)<0){
    throw Error('Untrusted audience status evidence.');
  }
  let sum=0;
  for(const key of STATUS_KEYS){
    const n=counts[key];
    if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0){
      throw Error('Invalid aggregate audience count.');
    }
    sum+=n;
    if(!Number.isSafeInteger(sum))throw Error('Audience total exceeds safe integer.');
  }
  if(sum!==counts.total)throw Error('Audience count total mismatch.');

  const overlaps=d.blacklist_overlap;
  if(overlaps.source!=='acelle_owner_list_blacklist_overlap_v1'||
     overlaps.global_blacklist_policy!=='unverified'||
     overlaps.suppression_verified!==false||
     overlaps.recipient_send_authorized!==false||
     Object.keys(overlaps).length!==9) {
    throw Error('Unsafe blacklist overlap attestation.');
  }
  const overlapFields=[
    'subscribed_total','owner_blacklist_overlap','global_blacklist_overlap',
    'either_blacklist_overlap','without_either_blacklist_overlap',
  ] as const;
  for(const key of overlapFields) {
    const n=overlaps[key];
    if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0){
      throw Error('Invalid blacklist overlap aggregate.');
    }
  }
  if(overlaps.subscribed_total!==counts.subscribed ||
     overlaps.owner_blacklist_overlap>counts.subscribed ||
     overlaps.global_blacklist_overlap>counts.subscribed ||
     overlaps.either_blacklist_overlap>counts.subscribed ||
     overlaps.either_blacklist_overlap<
       Math.max(overlaps.owner_blacklist_overlap,overlaps.global_blacklist_overlap)||
     overlaps.either_blacklist_overlap+overlaps.without_either_blacklist_overlap!==
       counts.subscribed) {
    throw Error('Blacklist overlap contradicts subscriber status totals.');
  }


  for(const key of CHECKS)if(typeof d.checks[key]!=='boolean')
    throw Error('Missing server-side readiness check.');
  for(const key of COMPLIANCE)if(d.compliance[key]!=='unverified')
    throw Error('Client refuses unsupported compliance attestation.');
  return d as unknown as DeliveryReadiness;
}
export async function explicitlyReadDeliveryReadiness(
  requester:(req:Request)=>Promise<{status:number;json?:unknown}>,
  origin:string,siteUid:string,draftUid:string,requestUid:string,
  expectedAcelleUid:string,token:string
):Promise<DeliveryReadiness>{
  const req=buildReadinessRequest(origin,siteUid,draftUid,requestUid,token);
  const response=await requester(req);
  if(!response||response.status!==200)
    throw Error('Readiness GET not available. No delivery was attempted.');
  return parseDeliveryReadiness(response.json,siteUid,draftUid,requestUid,expectedAcelleUid);
}
