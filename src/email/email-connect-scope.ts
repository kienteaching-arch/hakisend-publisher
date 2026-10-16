/**
 * Owner-tested v0.1.9 HakiSend Publishing/Email Draft OAuth scope proof.
 * The server's exchange response is untrusted until the exact scope set is
 * attested. Additional email:send / email:schedule or admin scopes are forbidden.
 */
export const PUBLISHING_SCOPES=Object.freeze([
  'sites:read','content:read','content:write','publications:write','media:write'
] as const);
export const EMAIL_DRAFT_SCOPES=Object.freeze([
  'email:read','email:compose'
] as const);

export type ScopeValidation={
  readonly ok:true;
  readonly scopes:readonly string[];
}|{
  readonly ok:false;
  readonly reason:string;
};
export function verifyConnectScopes(
  raw:unknown,emailRequested:boolean
):ScopeValidation{
  if(!Array.isArray(raw))
    return {ok:false,reason:'Missing scope evidence in HakiSend exchange response.'};
  if(raw.length>16 || !raw.every(v=>typeof v==='string' &&
    v.trim()===v && v.length>0 && v.length<=80)){
    return {ok:false,reason:'Invalid scope evidence.'};
  }
  if(new Set(raw).size!==raw.length)
    return {ok:false,reason:'Duplicate scopes in exchange response.'};
  const expected=[
    ...PUBLISHING_SCOPES,...(emailRequested?EMAIL_DRAFT_SCOPES:[])
  ].sort();
  const actual=[...raw].sort();
  if(actual.length!==expected.length ||
    actual.some((s,i)=>s!==expected[i])){
    return {ok:false,reason:emailRequested
      ? 'Email draft access was not granted. The previous HakiSend connection was preserved.'
      : 'Unexpected scopes from HakiSend. The previous connection was preserved.'};
  }
  return {ok:true,scopes:expected};
}
/**
 * Verify the read-only Site-list shape for a new credential before replacing
 * an existing one. This does not grant Site ownership; each actual request
 * still goes through the server's current tenant permission checks.
 */
export function verifyEmailReconnectSitesProbe(
  status:unknown,payload:unknown
):boolean{
  if(typeof status!=='number'||status<200||status>=300||
    !payload||typeof payload!=='object'||Array.isArray(payload))return false;
  const result=payload as Record<string,unknown>;
  if(result.success!==true || !result.data)return false;
  const d=result.data;
  const rows=Array.isArray(d)?d:
    (typeof d==='object' && !Array.isArray(d)&&d!==null
      ? (d as Record<string,unknown>).sites:null);
  return Array.isArray(rows) && rows.length<=1000 &&
    rows.every(row=>row!==null && typeof row==='object' &&
      !Array.isArray(row) &&
      typeof (row as Record<string,unknown>).uid==='string' &&
      typeof (row as Record<string,unknown>).name==='string');
}
