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
export interface BudgetSnapshot {
  source:'acelle_cold_credit_plan_rate_snapshot_v1';
  credit_state:'no_active_subscription'|'not_granted_in_snapshot'|'unlimited_in_snapshot'|'limited_in_snapshot';
  credits_remaining_snapshot:number|null;
  rate_limit_configured:boolean;
  rate_limit_per_window:number|null;
  rate_window_amount:number|null;
  rate_window_unit:'second'|'minute'|'hour'|'day'|'week'|'month'|null;
  live_credit_balance_verified:false;
  live_rate_window_verified:false;
  quota_verified:false;
  send_authorized:false;
}
export interface ConsentProvenance {
  source:'acelle_subscriber_type_metadata_v1';
  double_optin_label:number;
  single_optin_label:number;
  imported_label:number;
  admin_added_label:number;
  other_or_missing_label:number;
  ip_metadata_present:number;
  subscribed_total:number;
  double_optin_receipt_verified:false;
  marketing_purpose_consent_verified:false;
  consent_audit_complete:false;
  send_authorized:false;
}
export interface ConsentTokenReceipts {
  source:'token_redemption_candidate_v1';
  state:'disabled'|'candidate_only';
  current_subscribed_redeemed_tokens:number|null;
  current_subscribed_withdrawn:number|null;
  mailbox_delivery_verified:false;
  marketing_consent_verified:false;
  unsubscribe_hooks_verified:false;
  send_authorized:false;
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
  budget_snapshot:BudgetSnapshot;
  consent_provenance:ConsentProvenance;
  consent_token_receipts:ConsentTokenReceipts;
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
     !obj(d.budget_snapshot)||
     !obj(d.consent_provenance)||
     !obj(d.consent_token_receipts)||
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
  // Numeric validation above precedes all casts (Record<string,unknown>).
  const total=counts.subscribed as number;
  const owner=overlaps.owner_blacklist_overlap as number;
  const global=overlaps.global_blacklist_overlap as number;
  const either=overlaps.either_blacklist_overlap as number;
  const clear=overlaps.without_either_blacklist_overlap as number;
  if(overlaps.subscribed_total!==total || owner>total || global>total ||
     either>total || either<Math.max(owner,global) || either+clear!==total) {
    throw Error('Blacklist overlap contradicts subscriber status totals.');
  }



  const budget=d.budget_snapshot;
  const states=['no_active_subscription','not_granted_in_snapshot',
    'unlimited_in_snapshot','limited_in_snapshot'];
  const units=['second','minute','hour','day','week','month'];
  if(budget.source!=='acelle_cold_credit_plan_rate_snapshot_v1'||
     !states.includes(String(budget.credit_state))||
     budget.live_credit_balance_verified!==false||
     budget.live_rate_window_verified!==false||
     budget.quota_verified!==false||budget.send_authorized!==false||
     Object.keys(budget).length!==11 ||
     typeof budget.rate_limit_configured!=='boolean') {
    throw Error('Unsafe Acelle quota snapshot attestation.');
  }
  if(budget.credit_state==='limited_in_snapshot') {
    if(typeof budget.credits_remaining_snapshot!=='number'||
       !Number.isSafeInteger(budget.credits_remaining_snapshot)||
       budget.credits_remaining_snapshot<0) {
      throw Error('Invalid finite credit snapshot.');
    }
  } else if(budget.credits_remaining_snapshot!==null) {
    throw Error('Nonfinite credit snapshot cannot report finite remaining.');
  }
  if(budget.credit_state==='no_active_subscription'&&budget.rate_limit_configured) {
    throw Error('No subscription cannot have active plan rate limit.');
  }
  if(budget.rate_limit_configured) {
    if(typeof budget.rate_limit_per_window!=='number'||
       !Number.isSafeInteger(budget.rate_limit_per_window)||
       budget.rate_limit_per_window<0||
       typeof budget.rate_window_amount!=='number'||
       !Number.isSafeInteger(budget.rate_window_amount)||
       budget.rate_window_amount<1||
       !units.includes(String(budget.rate_window_unit))) {
      throw Error('Invalid rate-limit plan configuration.');
    }
  } else if(budget.rate_limit_per_window!==null||
            budget.rate_window_amount!==null||budget.rate_window_unit!==null) {
    throw Error('Unconfigured rate limiter must have null configuration.');
  }

  const provenance=d.consent_provenance;
  const provenanceFields=[
    'double_optin_label','single_optin_label','imported_label',
    'admin_added_label','other_or_missing_label',
  ] as const;
  if(provenance.source!=='acelle_subscriber_type_metadata_v1'||
     provenance.double_optin_receipt_verified!==false||
     provenance.marketing_purpose_consent_verified!==false||
     provenance.consent_audit_complete!==false||
     provenance.send_authorized!==false||
     Object.keys(provenance).length!==12||
     typeof provenance.subscribed_total!=='number'||
     !Number.isSafeInteger(provenance.subscribed_total)||
     provenance.subscribed_total<0||
     typeof provenance.ip_metadata_present!=='number'||
     !Number.isSafeInteger(provenance.ip_metadata_present)||
     provenance.ip_metadata_present<0||
     provenance.ip_metadata_present>provenance.subscribed_total||
     provenance.subscribed_total!==counts.subscribed) {
    throw Error('Untrusted consent provenance labels.');
  }
  let labeledTotal=0;
  for(const key of provenanceFields) {
    const n=provenance[key];
    if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0)
      throw Error('Invalid consent provenance count.');
    labeledTotal+=n;
    if(!Number.isSafeInteger(labeledTotal))
      throw Error('Consent provenance count overflow.');
  }
  if(labeledTotal!==provenance.subscribed_total)
    throw Error('Consent provenance totals do not match subscriber status.');

  const receipt=d.consent_token_receipts;
  if(receipt.source!=='token_redemption_candidate_v1'||
     !['disabled','candidate_only'].includes(String(receipt.state))||
     Object.keys(receipt).length!==8 ||
     receipt.mailbox_delivery_verified!==false||
     receipt.marketing_consent_verified!==false||
     receipt.unsubscribe_hooks_verified!==false||
     receipt.send_authorized!==false) {
    throw Error('Untrusted candidate consent receipt state.');
  }
  const redeemed=receipt.current_subscribed_redeemed_tokens;
  const withdrawn=receipt.current_subscribed_withdrawn;
  if(receipt.state==='disabled') {
    if(redeemed!==null||withdrawn!==null)
      throw Error('Disabled consent ledger must have unknown, not zero, counts.');
  }else{
    if(typeof redeemed!=='number'||!Number.isSafeInteger(redeemed)||redeemed<0||
       typeof withdrawn!=='number'||!Number.isSafeInteger(withdrawn)||withdrawn<0||
       redeemed+withdrawn>total) {
      throw Error('Invalid candidate consent receipt totals.');
    }
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
