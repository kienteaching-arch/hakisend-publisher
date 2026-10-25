/**
 * Email Only: import an ordinary Obsidian Markdown note into the EXISTING
 * HakiSend Standalone Email Plan contract. No network write, no Post creation.
 * The later approved Save/Promote/Send flow uses existing backend APIs.
 */
import {normalizeLocalEmailPlan,serializeLocalEmailPlan}
 from './local-email-planner.ts';

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const LIST=/^[A-Za-z0-9_.:-]{3,191}$/;
const BLOCKED=/<!--\s*(?:hakisend:(?:free|paid|premium|member)|members?[-_: ]only|paywall)\b/i;
const HEAD=/^---\n([\s\S]*?)\n(?:---|\.\.\.)\n/;
const FIELD=/^(?:post_uid|hakisend_post_uid|email_source_post_uid|linked_post_uid)\s*:/im;
const POST=/^hakisend_type\s*:\s*["']?post["']?\s*$/im;
const NONSTANDALONE=/^hakisend_email_kind\s*:\s*(?!["']?standalone["']?\s*$)/im;
const READONLY=/^hakisend_(?:import_snapshot|read_only)\s*:\s*true\s*$/im;
export interface EmailOnlyImport {
  siteUid:string;
  listUid:string;
  subject:string;
  preheader:string;
  originalPath:string;
  sourceMarkdown:string;
}
export function validateEmailOnlySource(raw:string,path:string):string {
 if(typeof raw!=='string'||raw.length>250000||raw.includes('\0')||
    typeof path!=='string'||!path.endsWith('.md')||
    path.startsWith('/')||path.includes('\\')||
    path.split('/').some(x=>!x||x==='..')||
    path.startsWith('HakiSend Imports/')||
    path.startsWith('HakiSend Distribution Plans/')||
    path.startsWith('HakiSend Emails/'))
  throw Error('Choose an editable independent Markdown note, not a Post or Email Plan.');
 const src=raw.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 const match=src.startsWith('---\n')?HEAD.exec(src):null;
 if(src.startsWith('---\n')&&!match)
  throw Error('Invalid or unclosed YAML frontmatter.');
 const header=match?.[1]??'';
 if(FIELD.test(header)||POST.test(header)||NONSTANDALONE.test(header)||
    READONLY.test(header)||BLOCKED.test(src))
  throw Error('This note may contain Post or member-only content; Email Only is blocked.');
 const body=(match?src.slice(match[0].length):src).trim();
 if(!body||new TextEncoder().encode(body).length>200000||
    body.includes('{{')||body.includes('{%'))
  throw Error('Invalid, oversized or dynamic-template Email Only body.');
 return body;
}
export function createEmailOnlyPlanFromMarkdown(input:EmailOnlyImport):{
  planMarkdown:string;
  body:string;
  siteUid:string;
  listUid:string;
} {
 if(!input||typeof input.siteUid!=='string'||!UUID.test(input.siteUid)||
    typeof input.listUid!=='string'||!LIST.test(input.listUid))
  throw Error('Invalid Site/List identity for Email Only.');
 const pre=input.preheader??'';
 if(typeof pre!=='string'||new TextEncoder().encode(pre).length>255||
    /[\0\r\n]/.test(pre))throw Error('Invalid Email preview text.');
 const body=validateEmailOnlySource(input.sourceMarkdown,input.originalPath);
 const draft=normalizeLocalEmailPlan({
   kind:'standalone',siteUid:input.siteUid,subject:input.subject,
   listUid:'',sendPolicy:'now',
 });
 // Keep the existing plan's frontmatter keys and parser. Audience UID may be
 // Acelle native 191-char ID, unlike the old local planner's 128-char format.
 const base=serializeLocalEmailPlan(draft);
 const q=(x:string)=>JSON.stringify(x);
 const linked=base.replace('email_list_uid: ""',
   'email_list_uid: '+q(input.listUid));
 if(linked===base)throw Error('Email Plan format changed; import refused.');
 const result=linked.replace('email_store_on_hakisend: false',
   'email_preheader: '+q(pre)+'\nemail_store_on_hakisend: false')
   .replace('Write the standalone email here. Before dispatch, HakiSend must verify recipient consent, suppression, sender identity, unsubscribe, quota and receipts.',
    body);
 if(result===linked||!result.includes('## Email body\n\n'+body))
  throw Error('Email Plan template mismatch; nothing created.');
 return {planMarkdown:result,body,siteUid:draft.siteUid,listUid:input.listUid};
}
