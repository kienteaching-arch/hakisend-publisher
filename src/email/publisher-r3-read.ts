/** Obsidian R3 OAuth GET adapter. Server is authoritative, never infers send permission. */
const SITE=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const CAMPAIGN=/^[a-f0-9]{13}$/i;
const STATES=new Set(['new','scheduled','queued','sending','done','paused','error']);
export interface R3Campaign{uid:string;name:string;status:string}
export interface R3Campaigns{siteUid:string;campaigns:readonly R3Campaign[];truncated:boolean}
export interface R3Preflight{siteUid:string;campaign:R3Campaign;recipientCount:number|null;
 checks:Readonly<Record<string,{state:'pass'|'block'|'unknown';detail:string}>>}
type Req={url:string;method:'GET';headers:Record<string,string>;throw:false};
type Requester=(req:Req)=>Promise<{status:number;json?:unknown}>;
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function uid(v:string,re:RegExp){if(typeof v!=='string'||!re.test(v))throw Error('Invalid Site or Acelle Campaign identity');return v.toLowerCase();}
export function r3Origin(v:string){const u=new URL(v);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password||!u.hostname)throw Error('HTTPS HakiSend origin required');return u.origin;}
function request(origin:string,site:string,token:string,path:string):Req{
 if(!token||token.length<8||token.length>8192||/[\r\n\0]/.test(token))throw Error('Secure HakiSend OAuth token required');
 return {url:r3Origin(origin)+'/api/v1/hakisend/sites/'+uid(site,SITE)+'/publisher'+path,method:'GET',
 headers:{Accept:'application/json',Authorization:'Bearer '+token},throw:false};
}
function data(raw:unknown,site:string,source:string){
 if(!obj(raw)||raw.success!==true||!obj(raw.data))throw Error('Unverified Publisher response');
 const d=raw.data;
 if(d.source!==source||d.site_uid!==uid(site,SITE)||d.read_only!==true||
 d.send_authorized!==false||d.schedule_authorized!==false)throw Error('Unsafe Publisher response');
 return d;
}
function campaign(row:unknown):R3Campaign{
 if(!obj(row)||typeof row.uid!=='string'||!CAMPAIGN.test(row.uid)||typeof row.name!=='string'||
 !row.name.trim()||row.name.length>300||typeof row.status!=='string'||!STATES.has(row.status))throw Error('Invalid Campaign response');
 return {uid:row.uid.toLowerCase(),name:row.name,status:row.status};
}
export async function fetchR3Campaigns(fn:Requester,origin:string,site:string,token:string):Promise<R3Campaigns>{
 const res=await fn(request(origin,site,token,'/campaigns'));
 if(res.status!==200)throw Error('Campaign GET unavailable: HTTP '+res.status);
 const d=data(res.json,site,'publisher_r3_campaign_list_v1');
 if(!Array.isArray(d.campaigns)||d.campaigns.length>50||typeof d.truncated!=='boolean')throw Error('Invalid Campaign page');
 const list=d.campaigns.map(campaign);
 if(new Set(list.map(x=>x.uid)).size!==list.length)throw Error('Duplicate Campaign UID');
 return {siteUid:uid(site,SITE),campaigns:list,truncated:d.truncated};
}
export async function fetchR3Preflight(fn:Requester,origin:string,site:string,campaignUid:string,token:string):Promise<R3Preflight>{
 const id=uid(campaignUid,CAMPAIGN),res=await fn(request(origin,site,token,'/campaigns/'+id+'/preflight'));
 if(res.status!==200)throw Error('Preflight GET unavailable: HTTP '+res.status);
 const d=data(res.json,site,'publisher_r3_preflight_v1'),c=campaign(d.campaign);
 if(c.uid!==id||!obj(d.checks)||Object.keys(d.checks).length>24||
 !(d.recipient_count===null||(typeof d.recipient_count==='number'&&Number.isSafeInteger(d.recipient_count)&&d.recipient_count>=0)))throw Error('Mismatched preflight');
 const checks:Record<string,{state:'pass'|'block'|'unknown';detail:string}>={};
 for(const [name,value] of Object.entries(d.checks)){
 if(!/^[a-z_]{3,40}$/.test(name)||!obj(value)||!['pass','block','unknown'].includes(String(value.state))||
 typeof value.detail!=='string'||value.detail.length>700)throw Error('Invalid preflight check');
 checks[name]={state:value.state as 'pass'|'block'|'unknown',detail:value.detail};
 }
 return {siteUid:uid(site,SITE),campaign:c,recipientCount:d.recipient_count as number|null,checks};
}
