/**
 * Manual Acelle native per-message evidence read. This does not schedule
 * or send; "sent" is a local Acelle TrackingLog status, NOT inbox delivery.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMPAIGN=/^[a-f0-9]{13}$/;
const HTTPS=/^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i;

export interface NativeDeliveryEvidence{
  readonly siteUid:string;
  readonly campaignUid:string;
  readonly campaignNativeStatus:string;
  readonly ledgerStatus:string;
  readonly ledgerRevision:number;
  readonly acelleRecordedSent:number;
  readonly acelleRecordedFailed:number;
  readonly acelleRecordedDuplicate:number;
  readonly trackedWithBounce:number;
  readonly trackedWithComplaint:number;
  readonly unexpectedNativeActivity:boolean;
  readonly disclosure:string;
}
export function buildNativeDeliveryEvidenceGet(
  origin:string,siteUid:string,campaignUid:string,token:string
):{url:string;method:'GET';headers:Record<string,string>;throw:false}{
  const base=origin.replace(/\/+$/,'');
  if(!HTTPS.test(base))throw Error('HakiSend API requires an HTTPS origin.');
  if(!UUID.test(siteUid))throw Error('Invalid owned Site UID.');
  if(!CAMPAIGN.test(campaignUid))throw Error('Invalid Acelle Campaign UID.');
  if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token))
    throw Error('Secure OAuth Email read access is required.');
  return {
    url:base+'/api/v1/hakisend/sites/'+siteUid.toLowerCase()+
      '/emails/campaigns/'+campaignUid+'/delivery/evidence',
    method:'GET',
    headers:{Accept:'application/json',Authorization:'Bearer '+token},
    throw:false,
  };
}
export function parseNativeDeliveryEvidence(
  response:unknown,siteUid:string,campaignUid:string
):NativeDeliveryEvidence{
  if(!response||typeof response!=='object'||Array.isArray(response))
    throw Error('Invalid native delivery evidence response.');
  const wrapper=response as Record<string,unknown>;
  if(wrapper.success!==true||!wrapper.data||
    typeof wrapper.data!=='object'||Array.isArray(wrapper.data))
    throw Error('Native evidence could not be read.');
  const d=wrapper.data as Record<string,unknown>;
  if(d.contract_version!=='hks_acelle_native_message_evidence_v1' ||
    d.site_uid!==siteUid.toLowerCase() || d.campaign_uid!==campaignUid ||
    d.evidence_kind!=='acelle_local_tracking_counts_only' ||
    d.read_only!==true ||
    d.send_authorized!==false || d.dispatch_authorized!==false ||
    d.provider_handoff_receipt_verified!==false ||
    d.mailbox_delivery_verified!==false ||
    d.campaign_delivery_complete_verified!==false ||
    d.calendar_delivery_confirmed_at_utc!==null ||
    typeof d.unexpected_native_activity!=='boolean' ||
    typeof d.campaign_native_status!=='string' ||
    !['new','scheduled','queued','sending','done','awaiting_winner',
      'sending_winner'].includes(d.campaign_native_status) ||
    typeof d.ledger_status!=='string'||
    !['reserved','handoff_started','provider_accepted',
      'ambiguous','cancelled'].includes(d.ledger_status) ||
    !Number.isSafeInteger(d.ledger_revision) ||
    (d.ledger_revision as number)<1
  )throw Error('Missing native evidence safety boundary.');
  const fields=[
    'acelle_recorded_sent','acelle_recorded_failed',
    'acelle_recorded_duplicate','acelle_tracked_total',
    'tracked_with_bounce','tracked_with_complaint'
  ] as const;
  for(const field of fields){
    if(typeof d[field]!=='number' || !Number.isSafeInteger(d[field]) ||
       (d[field] as number)<0)throw Error('Invalid native evidence counts.');
  }
  const total=(d.acelle_recorded_sent as number)+
    (d.acelle_recorded_failed as number)+
    (d.acelle_recorded_duplicate as number);
  if(total!==d.acelle_tracked_total ||
     (d.tracked_with_bounce as number)>total ||
     (d.tracked_with_complaint as number)>total)
    throw Error('Inconsistent native evidence counts.');
  if(['reserved','cancelled'].includes(d.ledger_status) &&
     total>0 && d.unexpected_native_activity!==true)
    throw Error('Native messages exist without a verified handoff.');
  if(!['reserved','cancelled'].includes(d.ledger_status) &&
     d.unexpected_native_activity===true)
    throw Error('Invalid native handoff conflict evidence.');
  return {
    siteUid:siteUid.toLowerCase(),campaignUid,
    campaignNativeStatus:d.campaign_native_status,
    ledgerStatus:d.ledger_status,
    ledgerRevision:d.ledger_revision as number,
    acelleRecordedSent:d.acelle_recorded_sent as number,
    acelleRecordedFailed:d.acelle_recorded_failed as number,
    acelleRecordedDuplicate:d.acelle_recorded_duplicate as number,
    trackedWithBounce:d.tracked_with_bounce as number,
    trackedWithComplaint:d.tracked_with_complaint as number,
    unexpectedNativeActivity:d.unexpected_native_activity as boolean,
    disclosure:'Acelle recorded sending activity; inbox delivery and provider acceptance are NOT verified.',
  };
}
