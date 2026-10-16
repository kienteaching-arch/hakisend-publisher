/**
 * HakiSend native Acelle schedule read-only diagnostics, owner-invoked only.
 * This contract is intentionally NOT proof that provider accepted mail,
 * nor an API for scheduling, editing Campaigns or sending.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACELLE=/^[a-f0-9]{13}$/;
const HTTPS=/^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i;

export type NativeScheduleStatus =
  'native_unscheduled_draft'|'intent_only_unhanded'|
  'intent_cancelled_only'|'handoff_unknown'|
  'native_state_inconsistent'|'native_schedule_unattested'|
  'native_state_unattested';
export interface NativeScheduleDiagnostic {
  readonly siteUid:string;
  readonly campaignUid:string;
  readonly status:NativeScheduleStatus;
  readonly ledgerRevision:number|null;
  readonly ledgerStatus:string|null;
  readonly nativeMarkerPresent:boolean;
  readonly nativeStateInconsistent:boolean;
  readonly message:string;
}
export function buildNativeScheduleDiagnosticRequest(
  origin:string,siteUid:string,campaignUid:string,token:string
):{
  url:string;method:'GET';headers:Record<string,string>;throw:false
}{
  const base=origin.replace(/\/+$/,'');
  if(!HTTPS.test(base))throw Error('Only a configured HTTPS HakiSend origin is allowed.');
  if(!UUID.test(siteUid))throw Error('Invalid pinned Site UID.');
  if(!ACELLE.test(campaignUid))throw Error('Invalid native Acelle Campaign UID.');
  if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token))
    throw Error('Secure OAuth Email connection required.');
  return {
    url:base+'/api/v1/hakisend/sites/'+siteUid.toLowerCase()+
      '/emails/campaigns/'+campaignUid+'/schedule/diagnostic',
    method:'GET',
    headers:{Accept:'application/json',Authorization:'Bearer '+token},
    throw:false,
  };
}
const STATUS=new Set<string>([
 'native_unscheduled_draft','intent_only_unhanded','intent_cancelled_only',
 'handoff_unknown','native_state_inconsistent','native_schedule_unattested',
 'native_state_unattested',
]);
export function parseNativeScheduleDiagnostic(
  raw:unknown,siteUid:string,campaignUid:string
):NativeScheduleDiagnostic {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw Error('Invalid HakiSend diagnostic response.');
  const env=raw as Record<string,unknown>;
  if(env.success!==true||!env.data||typeof env.data!=='object'||
      Array.isArray(env.data))throw Error('HakiSend diagnostic was not verified.');
  const d=env.data as Record<string,unknown>;
  if(d.source!=='acelle_native_schedule_diagnostic_v1' ||
    d.site_uid!==siteUid.toLowerCase() || d.campaign_uid!==campaignUid ||
    typeof d.status!=='string'||!STATUS.has(d.status) ||
    d.read_only!==true || d.send_authorized!==false ||
    d.dispatch_authorized!==false ||
    d.provider_receipt_verified!==false ||
    d.provider_schedule_confirmed!==false ||
    d.native_schedule_confirmed!==false ||
    d.calendar_scheduled_at_utc!==null ||
    typeof d.native_schedule_present!=='boolean' ||
    typeof d.native_state_inconsistent!=='boolean' ||
    !['boolean'].includes(typeof d.has_ledger_intent) ||
    !(d.ledger_revision===null ||
      (Number.isSafeInteger(d.ledger_revision) && (d.ledger_revision as number)>0)) ||
    !(d.ledger_status===null || typeof d.ledger_status==='string')
  )throw Error('Unsafe or unverified native schedule response.');
  const message=d.status==='intent_only_unhanded'
    ?'Requested time exists in the internal ledger, not in native Acelle.'
    :d.status==='intent_cancelled_only'
      ?'Internal intent was cancelled; no provider or native cancellation proven.'
      :d.status==='native_schedule_unattested'
        ?'Acelle has native schedule markers; worker/provider confirmation is not verified.'
        :d.status==='native_unscheduled_draft'
          ?'Acelle is a draft without a verified send time.'
          :'Native schedule state needs operator reconciliation. No sending is authorized.';
  return {
    siteUid:siteUid.toLowerCase(),campaignUid,
    status:d.status as NativeScheduleStatus,
    ledgerRevision:d.ledger_revision as number|null,
    ledgerStatus:d.ledger_status as string|null,
    nativeMarkerPresent:d.native_schedule_present as boolean,
    nativeStateInconsistent:d.native_state_inconsistent as boolean,
    message,
  };
}
