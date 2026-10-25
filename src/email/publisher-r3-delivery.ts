/** R3 one-shot delivery. No SMTP, no auto-retry, no local scheduler. */
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const UID=/^[a-f0-9]{13}$/i;
const BASIS=new Set(['double_optin','single_optin','existing_relationship']);
const JOURNAL=new Set(['claimed','scheduled','handed_off','uncertain']);
export type DeliveryAction='send_now'|'schedule';
export type ConsentBasis='double_optin'|'single_optin'|'existing_relationship';
export interface R3Intent {siteUid:string;campaignUid:string;requestUid:string;action:DeliveryAction}
export interface R3Payload {request_uid:string;recipient_count_snapshot:number;consent_basis:ConsentBasis;
consent_source:string;approval_confirmed:true;delivery_date?:string;delivery_time?:string;timezone?:string}
export interface R3Receipt {siteUid:string;campaignUid:string;requestUid:string;action:DeliveryAction;
journalStatus:string;recipientCount:number;nativeStatus?:string}
type Req={url:string;method:'POST'|'GET';headers:Record<string,string>;body?:string;throw:false};
type Fetch=(req:Req)=>Promise<{status:number;json?:unknown}>;
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function id(x:string,re:RegExp){if(typeof x!=='string'||!re.test(x))throw Error('Invalid R3 identity');return x.toLowerCase();}
function base(x:string){const u=new URL(x);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password||!u.hostname)throw Error('HTTPS origin required');return u.origin;}
function auth(t:string){if(!t||t.length<8||t.length>8192||/[\r\n\0]/.test(t))throw Error('Explicit email delivery OAuth required');return 'Bearer '+t;}
function url(origin:string,site:string,campaign:string){
 return base(origin)+'/api/v1/hakisend/sites/'+id(site,UUID)+'/publisher/campaigns/'+id(campaign,UID)+'/delivery';
}
function validZone(z:string){if(z==='UTC')return true;if(!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(z))return false;
 try{new Intl.DateTimeFormat('en-US',{timeZone:z});return true}catch{return false}}
export function validateR3Payload(action:DeliveryAction,p:R3Payload){
 if(action!=='send_now'&&action!=='schedule')throw Error('Unknown delivery action');
 if(!obj(p)||!UUID.test(p.request_uid)||!Number.isSafeInteger(p.recipient_count_snapshot)||
 p.recipient_count_snapshot<1||!BASIS.has(p.consent_basis)||typeof p.consent_source!=='string'||
 p.consent_source.trim().length<12||p.consent_source.length>255||p.approval_confirmed!==true)throw Error('Missing consent or deliberate approval');
 if(action==='send_now'&&(p.delivery_date!==undefined||p.delivery_time!==undefined||p.timezone!==undefined))
   throw Error('Send Now may not include schedule fields');
 if(action==='schedule'&&(!p.delivery_date||!/^\d{4}-\d{2}-\d{2}$/.test(p.delivery_date)||
 !p.delivery_time||!/^\d{2}:\d{2}$/.test(p.delivery_time)||!p.timezone||!validZone(p.timezone)||
 Number(p.delivery_time.slice(0,2))>23||Number(p.delivery_time.slice(3))>59))throw Error('A valid date/time/timezone is required');
}
function receipt(raw:unknown,site:string,campaign:string,req:string,action:DeliveryAction):R3Receipt{
 if(!obj(raw)||raw.success!==true||!obj(raw.data))throw Error('Unverified delivery receipt');
 const d=raw.data;
 if(d.source!=='publisher_r3_delivery_receipt_v1'||d.site_uid!==id(site,UUID)||
 d.campaign_uid!==id(campaign,UID)||d.request_uid!==id(req,UUID)||d.action!==action||
 !JOURNAL.has(String(d.journal_status))||!Number.isSafeInteger(d.recipient_count)||
 (d.recipient_count as number)<1||d.may_retry!==false||d.inbox_delivered!==false)throw Error('Unsafe delivery receipt; do not retry');
 return {siteUid:site,campaignUid:campaign,requestUid:req,action,journalStatus:d.journal_status as string,
 recipientCount:d.recipient_count as number,...(typeof d.native_status==='string'?{nativeStatus:d.native_status}:{})};
}
export async function sendR3Once(fn:Fetch,origin:string,site:string,campaign:string,token:string,
 action:DeliveryAction,p:R3Payload,persist:(i:R3Intent)=>Promise<void>):Promise<R3Receipt>{
 validateR3Payload(action,p);
 const request:Req={url:url(origin,site,campaign)+(action==='send_now'?'/send-now':'/schedule'),method:'POST',
 headers:{Accept:'application/json',Authorization:auth(token),'Content-Type':'application/json'},body:JSON.stringify(p),throw:false};
 await persist({siteUid:site,campaignUid:campaign,requestUid:p.request_uid,action});
 let result;
 try{result=await fn(request)}catch{throw Error('Delivery outcome unknown: use receipt GET, NEVER retry POST')}
 if(result.status!==202)throw Error('HTTP '+result.status+': recover via receipt GET, never resend');
 const r=receipt(result.json,site,campaign,p.request_uid,action);
 if(r.recipientCount!==p.recipient_count_snapshot)throw Error('Recipient count mismatch: reconcile via GET');
 return r;
}
export async function readR3Receipt(fn:Fetch,origin:string,i:R3Intent,token:string):Promise<R3Receipt>{
 const req:Req={url:url(origin,i.siteUid,i.campaignUid)+'/receipts/'+id(i.requestUid,UUID),method:'GET',
 headers:{Accept:'application/json',Authorization:auth(token)},throw:false};
 const result=await fn(req);
 if(result.status!==200)throw Error('Receipt unavailable; DO NOT resend (HTTP '+result.status+')');
 return receipt(result.json,i.siteUid,i.campaignUid,i.requestUid,i.action);
}
