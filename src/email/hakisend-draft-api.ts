/**
 * HakiSend Sites M2.8.8-B private standalone Draft API adapter.
 * Only existing read/compose endpoints are allowed. No send/schedule/promotion.
 * Caller injects an OAuth session token and Obsidian.requestUrl (or a test double).
 */
export type DraftHttpMethod = 'GET' | 'POST' | 'PUT';
export interface DraftRequest {
  url: string;
  method: DraftHttpMethod;
  headers: Record<string, string>;
  body?: string;
  throw: false;
}
export interface DraftResponse { status: number; json?: unknown; }
export type DraftRequester = (request: DraftRequest) => Promise<DraftResponse>;
export type DraftApiSuffix = 'audiences' | 'drafts' | string;
export interface DraftApiError extends Error { status: number; code: string; }

const UUID = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
const HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i;
const MAX_BODY = 250_000;
const ERRORS = new Set(['revision_conflict', 'idempotency_conflict', 'invalid_draft_input']);
function assertUuid(uid: string): string {
  if (!UUID.test(uid)) throw Error('Invalid Site or Draft UUID.');
  return uid.toLowerCase();
}
function assertRoute(suffix: string, method: DraftHttpMethod): void {
  const readDraft = suffix.startsWith('drafts/') && UUID.test(suffix.slice(7));
  const allowed = (suffix === 'audiences' && method === 'GET')
    || (suffix === 'drafts' && (method === 'GET' || method === 'POST'))
    || (readDraft && (method === 'GET' || method === 'PUT'));
  if (!allowed) throw Error('Unsupported private Draft route or operation.');
}
export function buildDraftRequest(
  apiBaseUrl: string,
  siteUid: string,
  token: string,
  suffix: DraftApiSuffix,
  method: DraftHttpMethod,
  payload?: Record<string, unknown>,
): DraftRequest {
  const base = apiBaseUrl.replace(/\/+$/, '');
  if (!HTTPS_ORIGIN.test(base)) throw Error('HakiSend API must use a valid HTTPS origin.');
  const site = assertUuid(siteUid);
  assertRoute(suffix, method);
  if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) {
    throw Error('OAuth connection required.');
  }
  if ((method === 'GET' && payload !== undefined) ||
      (method !== 'GET' && payload === undefined)) {
    throw Error('Unexpected private Draft request body.');
  }
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  if (body && body.length > MAX_BODY) throw Error('Private Draft payload too large.');
  return {
    url: base + '/api/v1/hakisend/sites/' + site + '/emails/' + suffix,
    method,
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
    },
    ...(body === undefined ? {} : {body}),
    throw: false,
  };
}
export async function requestPrivateDraft<T>(
  requester: DraftRequester,
  apiBaseUrl: string,
  siteUid: string,
  token: string,
  suffix: DraftApiSuffix,
  method: DraftHttpMethod,
  payload?: Record<string, unknown>,
): Promise<T> {
  const request = buildDraftRequest(apiBaseUrl, siteUid, token, suffix, method, payload);
  // Never log request, authorization header, or Markdown body.
  const response = await requester(request);
  const raw = response?.json;
  const envelope = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (!response || response.status < 200 || response.status >= 300 || envelope.success !== true) {
    const code = typeof envelope.error === 'string' && ERRORS.has(envelope.error)
      ? envelope.error : 'request_failed';
    const err = Error('HakiSend private Draft: ' + code + ' (HTTP ' + (response?.status ?? 0) + ')') as DraftApiError;
    err.status = response?.status ?? 0;
    err.code = code;
    throw err;
  }
  if (!('data' in envelope)) throw Error('Missing HakiSend private Draft response data.');
  return envelope.data as T;
}
