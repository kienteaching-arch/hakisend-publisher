/**
 * User-invoked, GET-only R3 delivery receipt discovery from durable local intents.
 * It deliberately does NOT query eligible Campaigns because once Acelle accepts
 * Send/Schedule the native Campaign no longer has status NEW.
 * No retry POST, no deletion, no automatic background calls.
 */
import type {R3Intent} from './publisher-r3-delivery.ts';
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const CAMPAIGN=/^[a-f0-9]{13}$/i;
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export interface PendingDeliverySnapshot {
 readonly intents:readonly R3Intent[];
 readonly ignored:number;
}
export function knownPendingR3Receipts(
 raw:unknown,authorizedSites:readonly {uid:string}[]
):PendingDeliverySnapshot{
 if(raw===undefined||raw===null)return {intents:[],ignored:0};
 if(!obj(raw)||Object.keys(raw).length>1000)
   throw Error('Corrupted/oversized R3 delivery intent storage. Do not resend.');
 const authorized=new Set(authorizedSites.map(s=>s.uid.toLowerCase()));
 const intents:R3Intent[]=[];let ignored=0;
 const seen=new Set<string>();
 for(const [key,v] of Object.entries(raw)){
  if(!obj(v)||typeof v.siteUid!=='string'||!UUID.test(v.siteUid)||
     typeof v.campaignUid!=='string'||!CAMPAIGN.test(v.campaignUid)||
     typeof v.requestUid!=='string'||!UUID.test(v.requestUid)||
     (v.action!=='send_now'&&v.action!=='schedule')||
     !authorized.has(v.siteUid.toLowerCase())||
     key!==v.siteUid+':'+v.campaignUid||
     seen.has(v.siteUid+':'+v.campaignUid)){
   ignored++;continue;
  }
  seen.add(key);
  intents.push({siteUid:v.siteUid,campaignUid:v.campaignUid,
   requestUid:v.requestUid,action:v.action});
 }
 intents.sort((a,b)=>a.siteUid.localeCompare(b.siteUid)||
   a.campaignUid.localeCompare(b.campaignUid));
 return {intents,ignored};
}
