/**
 * Explicit private Markdown -> inert Acelle Draft promotion, review only.
 *
 * Backend route remains UNMOUNTED / feature OFF until plugin UAT. No send,
 * schedule or implicit retry. Never use the regular private draft transport:
 * its distinct allowlist intentionally forbids campaign promotion.
 */
import {parsePrivateDraftDetail} from './private-draft-list.ts';
import type {StandalonePlan} from './private-draft-contract.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export type PromotionMethod='POST'|'GET';
export interface PromotionTransport {
  url:string;method:PromotionMethod;headers:{Authorization:string;Accept:'application/json';'Content-Type'?:'application/json'};
  body?:string;throw:false;
}
export type PromotionRequester=(request:PromotionTransport)=>Promise<{status:number;json?:unknown}>;
export interface PromotionSender {fromEmail:string;fromName:string;replyTo:string}
export interface PromotionReceipt {
  request_uid:string;private_draft_uid:string;campaign_uid:string;
  status:'new';source_status:'completed';send_enabled:false;scheduled:false;run_at:null;
}
export interface PromotionIO {
  getSourceDraft:(draftUid:string)=>Promise<unknown>;
  persistRequestUid:(requestUid:string)=>Promise<void>;
  submit:(requestUid:string,revision:number,sender:PromotionSender)=>Promise<unknown>;
  getReceipt:(requestUid:string)=>Promise<unknown>;
  persistVerifiedReceipt:(receipt:PromotionReceipt)=>Promise<void>;
}
const obj=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x);
function uuid(v:string):string {
  if(typeof v!=='string'||!UUID.test(v))throw Error('Invalid promotion identity.');
  return v.toLowerCase();
}
function sender(s:PromotionSender):void {
  if(!s||!EMAIL.test(s.fromEmail)||s.fromEmail.length>254||
     !EMAIL.test(s.replyTo)||s.replyTo.length>254||
     typeof s.fromName!=='string'||!s.fromName.trim()||s.fromName.length>200||
     /[\0\r\n]/.test(s.fromEmail+s.fromName+s.replyTo)) {
    throw Error('Sender header is incomplete or invalid.');
  }
}
export function buildPromotionRequest(
  origin:string,siteUid:string,draftUid:string,requestUid:string,
  token:string,method:PromotionMethod,revision?:number,from?:PromotionSender,
):PromotionTransport {
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
     url.pathname!=='/' || !url.hostname ||
     !['GET','POST'].includes(method))throw Error('Promotion needs a plain HTTPS origin.');
  if(typeof token!=='string'||token.length<8||token.length>8192||/[\0\r\n]/.test(token)){
    throw Error('Secure OAuth Email connection required.');
  }
  const site=uuid(siteUid),draft=uuid(draftUid),request=uuid(requestUid);
  if(method==='POST') {
    if(!Number.isSafeInteger(revision)||(revision??0)<1||!from)throw Error('Current remote Draft revision and sender required.');
    sender(from);
  } else if(revision!==undefined||from!==undefined){
    throw Error('Read-only receipt request must have no mutation fields.');
  }
  const path='/api/v1/hakisend/sites/'+site+'/emails/drafts/'+draft+'/campaign-drafts';
  const body=method==='POST'?JSON.stringify({
    request_uid:request,revision,
    from_email:from!.fromEmail,from_name:from!.fromName,
    reply_to:from!.replyTo,
  }):undefined;
  return {url:url.origin+path+(method==='GET'?'/'+request:''),
    method,headers:{Authorization:'Bearer '+token,Accept:'application/json',
      ...(body?{'Content-Type':'application/json' as const}:{})},
    ...(body?{body}:{}),throw:false};
}
export async function requestPromotion(
  requester:PromotionRequester,origin:string,siteUid:string,draftUid:string,
  requestUid:string,token:string,method:PromotionMethod,
  revision?:number,from?:PromotionSender
):Promise<unknown> {
  const response=await requester(buildPromotionRequest(
    origin,siteUid,draftUid,requestUid,token,method,revision,from
  ));
  if(!response||!obj(response.json)||response.json.success!==true||
     response.status<200||response.status>=300||!('data' in response.json)){
    const error=Error('Campaign Draft promotion unavailable (HTTP '+(response?.status??0)+').') as Error&{status:number};
    error.status=response?.status??0;
    throw error;
  }
  return response.json.data;
}
export function validatePromotionReceipt(
  data:unknown,draftUid:string,requestUid:string,
):PromotionReceipt {
  const draft=uuid(draftUid),request=uuid(requestUid);
  if(!obj(data)||data.request_uid!==request||data.private_draft_uid!==draft||
     typeof data.campaign_uid!=='string'||!UUID.test(data.campaign_uid)||
     data.status!=='new'||data.source_status!=='completed'||
     data.send_enabled!==false||data.scheduled!==false||data.run_at!==null){
    throw Error('Campaign receipt is missing, ambiguous, or not an unsent Acelle Draft.');
  }
  return {
    request_uid:request,private_draft_uid:draft,
    campaign_uid:data.campaign_uid.toLowerCase(),status:'new',
    source_status:'completed',send_enabled:false,scheduled:false,run_at:null,
  };
}
function checkedPlan(plan:StandalonePlan):void {
  uuid(plan.siteUid);uuid(plan.draftUid);
  if(!Number.isSafeInteger(plan.revision)||(plan.revision??0)<1||
     !plan.subject.trim()||!plan.body.trim())throw Error('Save and verify a current Private Draft before promotion.');
}
async function verifiedRemoteSource(plan:StandalonePlan,io:PromotionIO):Promise<void> {
  const fresh=parsePrivateDraftDetail(await io.getSourceDraft(plan.draftUid),plan.draftUid);
  if(fresh.revision!==plan.revision||fresh.subject!==plan.subject||fresh.body!==plan.body){
    throw Error('Remote Private Draft changed: review it before promotion. Nothing created.');
  }
}
export async function explicitlyPromotePrivateDraft(
  plan:StandalonePlan,requestUid:string,s:PromotionSender,io:PromotionIO,
):Promise<PromotionReceipt> {
  checkedPlan(plan);const uid=uuid(requestUid);sender(s);
  // Source is re-read immediately before promoting; no HTML/body/list passed
  // from the client. User must confirm a modal before this function is called.
  await verifiedRemoteSource(plan,io);
  await io.persistRequestUid(uid); // MUST finish durable local write before POST
  const submitted=await io.submit(uid,plan.revision!,s);
  if(!obj(submitted)||submitted.send_enabled!==false||
     submitted.scheduled!==false||submitted.run_at!==null||
     submitted.status!=='new'||typeof submitted.campaign_uid!=='string'||
     !UUID.test(submitted.campaign_uid)){
    throw Error('Promotion outcome unknown; recover with read-only receipt GET.');
  }
  const result=validatePromotionReceipt(await io.getReceipt(uid),plan.draftUid,uid);
  if(result.campaign_uid.toLowerCase()!==submitted.campaign_uid.toLowerCase()){
    throw Error('Promotion receipt mismatches POST: do not retry.');
  }
  await io.persistVerifiedReceipt(result);
  return result;
}
/** User-initiated receipt lookup, never issues POST or changes Campaign. */
export async function explicitlyRecoverPrivatePromotion(
  plan:StandalonePlan,requestUid:string,io:Pick<PromotionIO,'getReceipt'|'persistVerifiedReceipt'>
):Promise<PromotionReceipt> {
  checkedPlan(plan);
  const receipt=validatePromotionReceipt(await io.getReceipt(uuid(requestUid)),
    plan.draftUid,requestUid);
  await io.persistVerifiedReceipt(receipt);
  return receipt;
}
