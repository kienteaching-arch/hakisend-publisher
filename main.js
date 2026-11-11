"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => HakiSendPublisherPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/email/hakisend-draft-api.ts
var UUID = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
var HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i;
var MAX_BODY = 25e4;
var ERRORS = /* @__PURE__ */ new Set(["revision_conflict", "idempotency_conflict", "invalid_draft_input"]);
function assertUuid(uid3) {
  if (!UUID.test(uid3)) throw Error("Invalid Site or Draft UUID.");
  return uid3.toLowerCase();
}
function assertRoute(suffix, method) {
  const readDraft = suffix.startsWith("drafts/") && UUID.test(suffix.slice(7));
  const senderDefaults = suffix.startsWith("drafts/") && suffix.endsWith("/sender-defaults") && UUID.test(suffix.slice(7, -16));
  const postAudiences = /^audiences\?post_uid=[0-9a-fA-F-]{36}$/.test(suffix);
  const allowed = (suffix === "audiences" || postAudiences) && method === "GET" || suffix === "drafts" && (method === "GET" || method === "POST") || readDraft && (method === "GET" || method === "PUT") || senderDefaults && method === "GET";
  if (!allowed) throw Error("Unsupported private Draft route or operation.");
}
function buildDraftRequest(apiBaseUrl, siteUid, token, suffix, method, payload) {
  const base2 = apiBaseUrl.replace(/\/+$/, "");
  if (!HTTPS_ORIGIN.test(base2)) throw Error("HakiSend API must use a valid HTTPS origin.");
  const site = assertUuid(siteUid);
  assertRoute(suffix, method);
  if (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token)) {
    throw Error("OAuth connection required.");
  }
  if (method === "GET" && payload !== void 0 || method !== "GET" && payload === void 0) {
    throw Error("Unexpected private Draft request body.");
  }
  const body = payload === void 0 ? void 0 : JSON.stringify(payload);
  if (body && body.length > MAX_BODY) throw Error("Private Draft payload too large.");
  return {
    url: base2 + "/api/v1/hakisend/sites/" + site + "/emails/" + suffix,
    method,
    headers: {
      "Accept": "application/json",
      "Authorization": "Bearer " + token,
      ...body === void 0 ? {} : { "Content-Type": "application/json" }
    },
    ...body === void 0 ? {} : { body },
    throw: false
  };
}
async function requestPrivateDraft(requester, apiBaseUrl, siteUid, token, suffix, method, payload) {
  var _a, _b;
  const request2 = buildDraftRequest(apiBaseUrl, siteUid, token, suffix, method, payload);
  const response = await requester(request2);
  const raw = response == null ? void 0 : response.json;
  const envelope = raw && typeof raw === "object" ? raw : {};
  if (!response || response.status < 200 || response.status >= 300 || envelope.success !== true) {
    const code = typeof envelope.error === "string" && ERRORS.has(envelope.error) ? envelope.error : "request_failed";
    const err = Error("HakiSend private Draft: " + code + " (HTTP " + ((_a = response == null ? void 0 : response.status) != null ? _a : 0) + ")");
    err.status = (_b = response == null ? void 0 : response.status) != null ? _b : 0;
    err.code = code;
    throw err;
  }
  if (!("data" in envelope)) throw Error("Missing HakiSend private Draft response data.");
  return envelope.data;
}

// src/email/local-email-planner.ts
var UUID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var ROOT = "HakiSend Emails";
var TITLE_MAX = 160;
function required(s, label, max = TITLE_MAX) {
  if (typeof s !== "string" || !s.trim() || s.length > max || /[\u0000-\u001f\u007f]/.test(s)) {
    throw Error(label + " is required (max " + max + " characters)");
  }
  return s.trim();
}
function uuid(s, label) {
  if (typeof s !== "string" || !UUID2.test(s)) throw Error("Invalid " + label);
  return s.toLowerCase();
}
function safeFilename(input) {
  return input.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ").replace(/^\.+|\.+$/g, "").replace(/\s+/g, " ").trim().slice(0, 75) || "Email";
}
function parseLocalEmailUtcSchedule(input, now = /* @__PURE__ */ new Date()) {
  var _a;
  const value = required(input, "Scheduled time", 40);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value))
    throw Error("Use ISO 8601 with an explicit timezone offset.");
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || millis <= now.getTime())
    throw Error("Scheduled time must be valid and in the future.");
  const matched = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!matched) throw Error("Invalid ISO email schedule.");
  const year = Number(matched[1]), month = Number(matched[2]), day = Number(matched[3]);
  const hh = Number(matched[4]), mm = Number(matched[5]), ss = Number((_a = matched[6]) != null ? _a : 0);
  if (year < 2e3 || month < 1 || month > 12 || day < 1 || day > 31 || hh > 23 || mm > 59 || ss > 59 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())
    throw Error("Invalid calendar date or local clock.");
  const zone = matched[7];
  if (zone !== "Z" && Math.abs(Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6))) > 14 * 60)
    throw Error("Invalid timezone offset.");
  return new Date(millis).toISOString();
}
function normalizeLocalEmailPlan(input, now = /* @__PURE__ */ new Date()) {
  var _a;
  if (!input || input.kind !== "standalone" && input.kind !== "post_linked_free")
    throw Error("Choose a valid Email type.");
  const siteUid = uuid(input.siteUid, "Site UID");
  const subject = required(input.subject, "Email subject");
  const listUid = String((_a = input.listUid) != null ? _a : "").trim();
  if (listUid && !/^[A-Za-z0-9_-]{1,128}$/.test(listUid))
    throw Error("Audience list UID contains unsupported characters.");
  const result = {
    kind: input.kind,
    siteUid,
    subject,
    listUid: listUid.toLowerCase(),
    status: "local_draft",
    sendPolicy: "now",
    scheduledAtUtc: "",
    sourceNote: "",
    postUid: "",
    storeOnHakisend: false,
    publishEmailArchive: false
  };
  if (input.kind === "post_linked_free") {
    if (input.sourceSiteUid && uuid(input.sourceSiteUid, "source Post Site UID") !== siteUid)
      throw Error("The selected Site differs from the source Post pinned Site.");
    const path = required(input.sourceNote, "Source Post note", 1024);
    if (!path.endsWith(".md") || path.startsWith("HakiSend Imports/") || path.startsWith(ROOT + "/") || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
      throw Error("Choose an editable Post note outside imported snapshots.");
    }
    if (input.isReadOnlySnapshot)
      throw Error("Read-only HakiSend snapshot cannot be a Post-linked email source.");
    if (input.postUid) result.postUid = uuid(input.postUid, "Post UID");
    if (input.sendPolicy && input.sendPolicy !== "on_publication")
      throw Error("Post-linked email can only follow publication.");
    if (input.scheduleInput)
      throw Error("Post-linked email cannot have an independent send time.");
    result.sourceNote = path;
    result.sendPolicy = "on_publication";
  } else {
    if (input.sourceNote || input.postUid)
      throw Error("Standalone email must not publish or reference a Post.");
    if (input.sendPolicy !== "now" && input.sendPolicy !== "scheduled")
      throw Error("Standalone email requires a local send policy.");
    result.sendPolicy = input.sendPolicy;
    if (input.sendPolicy === "scheduled")
      result.scheduledAtUtc = parseLocalEmailUtcSchedule(input.scheduleInput, now);
    else if (input.scheduleInput)
      throw Error("Send-now email cannot have a schedule.");
  }
  return result;
}
function serializeLocalEmailPlan(draft, displayContext = {}) {
  const q = (s) => JSON.stringify(s);
  const siteName = String(displayContext.siteName || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 100);
  const listName = String(displayContext.listName || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 100);
  const lines = [
    "---",
    "hakisend_type: email_campaign",
    "hakisend_email_kind: " + q(draft.kind),
    "site_uid: " + q(draft.siteUid),
    "email_subject: " + q(draft.subject),
    "email_list_uid: " + q(draft.listUid),
    "email_list_name: " + q(listName),
    "email_send_policy: " + q(draft.sendPolicy),
    "email_scheduled_at_utc: " + q(draft.scheduledAtUtc),
    "email_source_note: " + q(draft.sourceNote),
    "email_source_post_uid: " + q(draft.postUid),
    "email_store_on_hakisend: false",
    "email_publish_archive: false",
    "email_dispatch_ready: false",
    "hakisend_local_only: true",
    "hakisend_status: " + q("local_draft"),
    "---",
    "",
    "> [!warning] Bản nháp email — chưa gửi",
    ...(siteName ? ["> **Trang:** " + siteName + (listName ? " · **Danh sách:** " + listName : "")] : []),
    "> Viết email bên dưới. Khi xong, chọn nút Email HakiSend để tiếp tục gửi.",
    ""
  ];
  if (draft.kind === "post_linked_free") {
    lines.push(
      "Source Post: " + q(draft.sourceNote),
      "",
      "The free excerpt is determined on HakiSend after the Post is actually public. Do not paste member-only content.",
      "",
      "Linked Email follows verified Post publication and has no independent delivery schedule.",
      "",
      "## Email introduction (optional)",
      "",
      ""
    );
  } else {
    lines.push(
      "## Nội dung email",
      "",
      "Viết nội dung email của bạn ở đây.",
      ""
    );
  }
  return lines.join("\n");
}
function localEmailPlanPaths(siteUid, kind, title) {
  const site = uuid(siteUid, "Site UID");
  if (kind !== "standalone" && kind !== "post_linked_free")
    throw Error("Invalid Email Plan type.");
  return {
    root: ROOT,
    directory: ROOT + "/" + site,
    basename: (kind === "standalone" ? "Email" : "Post Email") + " - " + safeFilename(required(title, "Email subject"))
  };
}
function localEmailSourceContext(path, extension, metadata = {}) {
  if (!path || extension !== "md")
    return { sourceNote: "", postUid: "", sourceSiteUid: "", isReadOnlySnapshot: false };
  return {
    sourceNote: path,
    postUid: typeof metadata.post_uid === "string" ? metadata.post_uid : typeof metadata.hakisend_post_uid === "string" ? metadata.hakisend_post_uid : "",
    sourceSiteUid: typeof metadata.site_uid === "string" ? metadata.site_uid : "",
    isReadOnlySnapshot: metadata.hakisend_import_snapshot === true || metadata.hakisend_read_only === true
  };
}

// src/email/r3-email-only-source.ts
var UUID3 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var LIST = /^[A-Za-z0-9_.:-]{3,191}$/;
var BLOCKED = /<!--\s*(?:hakisend:(?:free|paid|premium|member)|members?[-_: ]only|paywall)\b/i;
var HEAD = /^---\n([\s\S]*?)\n(?:---|\.\.\.)\n/;
var FIELD = /^(?:post_uid|hakisend_post_uid|email_source_post_uid|linked_post_uid)\s*:/im;
var POST = /^hakisend_type\s*:\s*["']?post["']?\s*$/im;
var NONSTANDALONE = /^hakisend_email_kind\s*:\s*(?!["']?standalone["']?\s*$)/im;
var READONLY = /^hakisend_(?:import_snapshot|read_only)\s*:\s*true\s*$/im;
function validateEmailOnlySource(raw, path) {
  var _a;
  if (typeof raw !== "string" || raw.length > 25e4 || raw.includes("\0") || typeof path !== "string" || !path.endsWith(".md") || path.startsWith("/") || path.includes("\\") || path.split("/").some((x) => !x || x === "..") || path.startsWith("HakiSend Imports/") || path.startsWith("HakiSend Distribution Plans/") || path.startsWith("HakiSend Emails/"))
    throw Error("Choose an editable independent Markdown note, not a Post or Email Plan.");
  const src = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = src.startsWith("---\n") ? HEAD.exec(src) : null;
  if (src.startsWith("---\n") && !match)
    throw Error("Invalid or unclosed YAML frontmatter.");
  const header = (_a = match == null ? void 0 : match[1]) != null ? _a : "";
  if (FIELD.test(header) || POST.test(header) || NONSTANDALONE.test(header) || READONLY.test(header) || BLOCKED.test(src))
    throw Error("This note may contain Post or member-only content; Email Only is blocked.");
  const body = (match ? src.slice(match[0].length) : src).trim();
  if (!body || new TextEncoder().encode(body).length > 2e5 || body.includes("{{") || body.includes("{%"))
    throw Error("Invalid, oversized or dynamic-template Email Only body.");
  return body;
}
function createEmailOnlyPlanFromMarkdown(input) {
  var _a;
  if (!input || typeof input.siteUid !== "string" || !UUID3.test(input.siteUid) || typeof input.listUid !== "string" || !LIST.test(input.listUid))
    throw Error("Invalid Site/List identity for Email Only.");
  const pre = (_a = input.preheader) != null ? _a : "";
  if (typeof pre !== "string" || new TextEncoder().encode(pre).length > 255 || /[\0\r\n]/.test(pre)) throw Error("Invalid Email preview text.");
  const body = validateEmailOnlySource(input.sourceMarkdown, input.originalPath);
  const draft = normalizeLocalEmailPlan({
    kind: "standalone",
    siteUid: input.siteUid,
    subject: input.subject,
    listUid: "",
    sendPolicy: "now"
  });
  const base2 = serializeLocalEmailPlan(draft);
  const q = (x) => JSON.stringify(x);
  const linked = base2.replace(
    'email_list_uid: ""',
    "email_list_uid: " + q(input.listUid)
  );
  if (linked === base2) throw Error("Email Plan format changed; import refused.");
  const result = linked.replace(
    "email_store_on_hakisend: false",
    "email_preheader: " + q(pre) + "\nemail_store_on_hakisend: false"
  ).replace(
    "Viết nội dung email của bạn ở đây.",
    body
  );
  if (result === linked || !result.includes("## Nội dung email\n\n" + body))
    throw Error("Email Plan template mismatch; nothing created.");
  return { planMarkdown: result, body, siteUid: draft.siteUid, listUid: input.listUid };
}

// src/email/private-draft-list.ts
var UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var object = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
function parsePrivateDraftList(data2) {
  if (!Array.isArray(data2) || data2.length > 50) {
    throw Error("Unexpected or unbounded private Email list.");
  }
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of data2) {
    if (!object(raw) || typeof raw.uid !== "string" || !UUID4.test(raw.uid) || typeof raw.subject !== "string" || !raw.subject.trim() || raw.subject.length > 255 || /[\0\r\n]/.test(raw.subject) || !Number.isSafeInteger(raw.revision) || raw.revision < 1 || raw.status !== "private_draft" || raw.send_enabled !== false || raw.scheduled !== false || raw.acelle_campaign_uid !== null || "body_markdown" in raw) {
      throw Error("Unverified private Email summary.");
    }
    const id2 = raw.uid.toLowerCase();
    if (seen.has(id2)) throw Error("Duplicate private Email identity.");
    seen.add(id2);
    result.push({ uid: id2, subject: raw.subject, revision: raw.revision });
  }
  return result;
}
function parsePrivateDraftDetail(data2, expectedUid) {
  if (!UUID4.test(expectedUid) || !object(data2) || data2.uid !== expectedUid || data2.status !== "private_draft" || data2.send_enabled !== false || data2.scheduled !== false || data2.acelle_campaign_uid !== null || typeof data2.subject !== "string" || !data2.subject.trim() || data2.subject.length > 255 || /[\0\r\n]/.test(data2.subject) || !Number.isSafeInteger(data2.revision) || data2.revision < 1 || typeof data2.body_markdown !== "string" || data2.body_markdown.length > 2e5 || data2.body_markdown.includes("\0")) {
    throw Error("Unverified or mismatched private Email detail.");
  }
  return {
    uid: expectedUid,
    subject: data2.subject,
    revision: data2.revision,
    body: data2.body_markdown
  };
}

// src/email/private-draft-promotion.ts
var UUID5 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var ACELLE_UID = /^[0-9a-f]{13}$/i;
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var obj = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
function uuid2(v) {
  if (typeof v !== "string" || !UUID5.test(v)) throw Error("Invalid promotion identity.");
  return v.toLowerCase();
}
function sender(s) {
  if (!s || !EMAIL.test(s.fromEmail) || s.fromEmail.length > 254 || !EMAIL.test(s.replyTo) || s.replyTo.length > 254 || typeof s.fromName !== "string" || !s.fromName.trim() || s.fromName.length > 200 || /[\0\r\n]/.test(s.fromEmail + s.fromName + s.replyTo)) {
    throw Error("Sender header is incomplete or invalid.");
  }
}
function buildPromotionRequest(origin, siteUid, draftUid, requestUid, token, method, revision, from) {
  const url2 = new URL(origin);
  if (url2.protocol !== "https:" || url2.username || url2.password || url2.search || url2.hash || url2.pathname !== "/" || !url2.hostname || !["GET", "POST"].includes(method)) throw Error("Promotion needs a plain HTTPS origin.");
  if (typeof token !== "string" || token.length < 8 || token.length > 8192 || /[\0\r\n]/.test(token)) {
    throw Error("Secure OAuth Email connection required.");
  }
  const site = uuid2(siteUid), draft = uuid2(draftUid), request2 = uuid2(requestUid);
  if (method === "POST") {
    if (!Number.isSafeInteger(revision) || (revision != null ? revision : 0) < 1 || !from) throw Error("Current remote Draft revision and sender required.");
    sender(from);
  } else if (revision !== void 0 || from !== void 0) {
    throw Error("Read-only receipt request must have no mutation fields.");
  }
  const path = "/api/v1/hakisend/sites/" + site + "/emails/drafts/" + draft + "/campaign-drafts";
  const body = method === "POST" ? JSON.stringify({
    request_uid: request2,
    revision,
    from_email: from.fromEmail,
    from_name: from.fromName,
    reply_to: from.replyTo
  }) : void 0;
  return {
    url: url2.origin + path + (method === "GET" ? "/" + request2 : ""),
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json",
      ...body ? { "Content-Type": "application/json" } : {}
    },
    ...body ? { body } : {},
    throw: false
  };
}
async function requestPromotion(requester, origin, siteUid, draftUid, requestUid, token, method, revision, from) {
  var _a, _b;
  const response = await requester(buildPromotionRequest(
    origin,
    siteUid,
    draftUid,
    requestUid,
    token,
    method,
    revision,
    from
  ));
  if (!response || !obj(response.json) || response.json.success !== true || response.status < 200 || response.status >= 300 || !("data" in response.json)) {
    const error = Error("Campaign Draft promotion unavailable (HTTP " + ((_a = response == null ? void 0 : response.status) != null ? _a : 0) + ").");
    error.status = (_b = response == null ? void 0 : response.status) != null ? _b : 0;
    throw error;
  }
  return response.json.data;
}
function validatePromotionReceipt(data2, draftUid, requestUid) {
  const draft = uuid2(draftUid), request2 = uuid2(requestUid);
  if (!obj(data2) || data2.request_uid !== request2 || data2.private_draft_uid !== draft || typeof data2.campaign_uid !== "string" || !ACELLE_UID.test(data2.campaign_uid) || data2.status !== "new" || data2.source_status !== "completed" || data2.send_enabled !== false || data2.scheduled !== false || data2.run_at !== null) {
    throw Error("Campaign receipt is missing, ambiguous, or not an unsent Acelle Draft.");
  }
  return {
    request_uid: request2,
    private_draft_uid: draft,
    campaign_uid: data2.campaign_uid.toLowerCase(),
    status: "new",
    source_status: "completed",
    send_enabled: false,
    scheduled: false,
    run_at: null
  };
}
function checkedPlan(plan) {
  var _a;
  uuid2(plan.siteUid);
  uuid2(plan.draftUid);
  if (!Number.isSafeInteger(plan.revision) || ((_a = plan.revision) != null ? _a : 0) < 1 || !plan.subject.trim() || !plan.body.trim()) throw Error("Save and verify a current Private Draft before promotion.");
}
async function verifiedRemoteSource(plan, io) {
  const fresh = parsePrivateDraftDetail(await io.getSourceDraft(plan.draftUid), plan.draftUid);
  if (fresh.revision !== plan.revision || fresh.subject !== plan.subject || fresh.body !== plan.body) {
    throw Error("Remote Private Draft changed: review it before promotion. Nothing created.");
  }
}
async function explicitlyPromotePrivateDraft(plan, requestUid, s, io) {
  checkedPlan(plan);
  const uid3 = uuid2(requestUid);
  sender(s);
  await verifiedRemoteSource(plan, io);
  await io.persistRequestUid(uid3);
  const submitted = await io.submit(uid3, plan.revision, s);
  if (!obj(submitted) || submitted.send_enabled !== false || submitted.scheduled !== false || submitted.run_at !== null || submitted.status !== "new" || typeof submitted.campaign_uid !== "string" || !ACELLE_UID.test(submitted.campaign_uid)) {
    throw Error("Promotion outcome unknown; recover with read-only receipt GET.");
  }
  const result = validatePromotionReceipt(await io.getReceipt(uid3), plan.draftUid, uid3);
  if (result.campaign_uid.toLowerCase() !== submitted.campaign_uid.toLowerCase()) {
    throw Error("Promotion receipt mismatches POST: do not retry.");
  }
  await io.persistVerifiedReceipt(result);
  return result;
}
async function explicitlyRecoverPrivatePromotion(plan, requestUid, io) {
  checkedPlan(plan);
  const receipt2 = validatePromotionReceipt(
    await io.getReceipt(uuid2(requestUid)),
    plan.draftUid,
    requestUid
  );
  await io.persistVerifiedReceipt(receipt2);
  return receipt2;
}

// src/email/r3-pinned-email-source.ts
var UUID6 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var ACELLE = /^[0-9a-f]{13}$/i;
var object2 = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function verifyPinnedEmailSource(plan, campaignUid, promotionRequestUid, remoteDraft, remotePromotionReceipt) {
  var _a, _b;
  if (!plan || typeof plan.siteUid !== "string" || !UUID6.test(plan.siteUid) || !UUID6.test(plan.draftUid) || !UUID6.test(plan.requestUid) || !Number.isSafeInteger(plan.revision) || ((_a = plan.revision) != null ? _a : 0) < 1 || typeof plan.listUid !== "string" || !plan.listUid || typeof plan.subject !== "string" || !plan.subject.trim() || typeof plan.body !== "string" || !plan.body.trim() || typeof promotionRequestUid !== "string" || !UUID6.test(promotionRequestUid) || typeof campaignUid !== "string" || !ACELLE.test(campaignUid))
    throw Error("Pinned email has missing verified local identities.");
  if (!object2(remoteDraft) || remoteDraft.uid !== plan.draftUid || remoteDraft.request_uid !== plan.requestUid || remoteDraft.list_uid !== plan.listUid || remoteDraft.revision !== plan.revision || remoteDraft.subject !== plan.subject || ((_b = remoteDraft.preheader) != null ? _b : "") !== plan.preheader || remoteDraft.body_markdown !== plan.body || remoteDraft.status !== "private_draft" || remoteDraft.send_enabled !== false || remoteDraft.scheduled !== false || remoteDraft.acelle_campaign_uid !== null)
    throw Error("Email was edited or remote Draft differs. Re-save and review before any send.");
  const receipt2 = validatePromotionReceipt(
    remotePromotionReceipt,
    plan.draftUid,
    promotionRequestUid
  );
  if (receipt2.campaign_uid !== campaignUid)
    throw Error("Native Acelle Campaign no longer matches this Email Only plan.");
  return {
    campaignUid,
    siteUid: plan.siteUid,
    draftUid: plan.draftUid,
    draftRevision: plan.revision,
    promotionRequestUid,
    subject: plan.subject,
    listUid: plan.listUid,
    body: plan.body,
    preheader: plan.preheader
  };
}

// src/email/r3-private-draft-recovery.ts
var UUID7 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var obj2 = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function locateDraftForRecovery(rows, plan) {
  var _a;
  if (!plan.requestUid || !UUID7.test(plan.requestUid) || plan.draftUid)
    throw Error("Only a persisted, unresolved Private Draft request may be recovered.");
  if (!Array.isArray(rows) || rows.length > 50)
    throw Error("Unbounded or untrusted Draft index. Do not retry POST.");
  const matches = rows.filter((row2) => obj2(row2) && row2.request_uid === plan.requestUid);
  if (matches.length !== 1) throw Error("The request UID is not uniquely discoverable. Manual reconciliation required; do not retry POST.");
  const row = matches[0];
  if (typeof row.uid !== "string" || !UUID7.test(row.uid) || row.status !== "private_draft" || row.send_enabled !== false || row.scheduled !== false || row.acelle_campaign_uid !== null || row.list_uid !== plan.listUid || row.subject !== plan.subject || ((_a = row.preheader) != null ? _a : "") !== plan.preheader || !Number.isSafeInteger(row.revision) || row.revision < 1)
    throw Error("Draft summary does not match local Email Only source.");
  return row.uid.toLowerCase();
}
function verifyRecoveredPrivateDraft(raw, plan, uid3) {
  var _a;
  if (!obj2(raw) || !UUID7.test(uid3) || raw.uid !== uid3 || raw.request_uid !== plan.requestUid || raw.list_uid !== plan.listUid || raw.subject !== plan.subject || ((_a = raw.preheader) != null ? _a : "") !== plan.preheader || raw.body_markdown !== plan.body || raw.status !== "private_draft" || raw.send_enabled !== false || raw.scheduled !== false || raw.acelle_campaign_uid !== null || !Number.isSafeInteger(raw.revision) || raw.revision < 1)
    throw Error("Private Draft detail is not an exact body/list/request match.");
  return { uid: uid3, revision: raw.revision };
}

// src/email/private-draft-contract.ts
var UUID8 = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
var LIST_UID = /^[A-Za-z0-9_.:\-]{3,191}$/;
var ROOT2 = "HakiSend Emails/";
var encoder = new TextEncoder();
function validUuid(value) {
  return typeof value === "string" && UUID8.test(value);
}
function byteLength(value) {
  return encoder.encode(value).length;
}
function localEmailFieldsFromRaw(markdown, cached = {}) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!front || typeof import_obsidian.parseYaml !== "function") return cached;
  const parsed = import_obsidian.parseYaml(front[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw Error("Không đọc được thông tin email. Hãy kiểm tra phần Properties.");
  return parsed;
}
/** Decide the novice's single Email action without making any network calls. */
function r3SimpleEmailEntryMode(file, fields = {}) {
  if (!file || file.extension !== "md" || !file.path?.startsWith(ROOT2) || fields.hakisend_type !== "email_campaign")
    return "create";
  if (fields.hakisend_email_kind !== "standalone") return "other_email";
  if (fields.email_dispatch_ready === true || !!fields.hakisend_delivery_verified_at || /^email_(?:scheduled|processing|completed|needs_review)$/.test(fields.hakisend_status || ""))
    return "submitted";
  return "continue";
}
function extractStandaloneEmailBody(markdown) {
  if (typeof markdown !== "string") throw Error("Invalid local Email Markdown.");
  const source = markdown.replace(/\r\n/g, "\n");
  // Prefer the fixed local-plan guidance boundary. The user's first heading
  // is editable, so only strip our two generated wrapper headings, never a
  // custom heading such as "## Parenting".
  const guidanceLines = [
    "> Authoring only. No recipient lookup, public archive or email dispatch happens from this note.",
    "> Viết email bên dưới. Khi xong, nhấn biểu tượng máy bay giấy HakiSend hoặc chọn lệnh '2. Tiếp tục gửi email'.",
    "> Viết email bên dưới. Khi xong, chọn nút Email HakiSend để tiếp tục gửi.",
    "> HakiSend đã xác nhận lịch gửi này. Bạn có thể cập nhật trạng thái bất cứ lúc nào bằng lệnh 'HakiSend: Cập nhật trạng thái gửi email'.",
    "> HakiSend đang xử lý yêu cầu. Bạn có thể tiếp tục công việc và kiểm tra kết quả sau.",
    "> HakiSend đã hoàn tất xử lý gửi. Bạn có thể xem thông tin giao nhận chi tiết trên HakiSend.",
    "> Kết quả cần được đối chiếu trên HakiSend. Đừng thực hiện thao tác gửi lại email này."
  ];
  const sectionMarker = "<!-- hakisend:email-body:start -->";
  const sectionIndex = source.indexOf(sectionMarker);
  if (sectionIndex >= 0) {
    return source.slice(sectionIndex + sectionMarker.length).trim().replace(/^## (?:Email body|Nội dung email)[ \t]*(?:\n|$)/i, "").trim();
  }
  for (const guidance of guidanceLines) {
    const index = source.indexOf(guidance);
    if (index >= 0) {
      return source.slice(index + guidance.length).trim().replace(/^## (?:Email body|Nội dung email)[ \t]*(?:\n|$)/i, "").trim();
    }
  }
  // Support hand-authored legacy plans with an explicit Email body heading.
  const marker = /^## (?:Email body|Nội dung email)\s*$/im.exec(source);
  if (marker) return source.slice(marker.index + marker[0].length).trim();
  throw Error("Không xác định được nội dung email. Hãy mở Email Plan và viết nội dung bên dưới phần thông báo màu cam.");
}
/** Local-only presentation migration. The exact outgoing email body must be unchanged. */
function simplifyStandaloneEmailNote(markdown, fields = {}) {
  if (typeof markdown !== "string" || fields.hakisend_type !== "email_campaign" || fields.hakisend_email_kind !== "standalone")
    return markdown;
  const oldBody = extractStandaloneEmailBody(markdown);
  let next = markdown;
  const marker = "<!-- hakisend:email-body:start -->";
  const markerIndex = next.indexOf(marker);
  if (markerIndex >= 0) {
    const after = next.slice(markerIndex + marker.length);
    // Preserve a user's first custom heading. Insert a stable, readable
    // boundary so removing the old HTML marker never changes the email body.
    const hasBodyHeading = /^\s*## (?:Email body|Nội dung email)[ \t]*(?:\r?\n|$)/i.test(after);
    next = next.replace(marker, hasBodyHeading ? "" : "## Nội dung email");
  }
  const front = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(next);
  if (front && typeof fields.email_subject === "string" && fields.email_subject.trim()) {
    const before = next.slice(0, front[0].length);
    const text = next.slice(front[0].length);
    const title = /^\s*# ([^\r\n]+)(?:\r?\n|$)/.exec(text);
    if (title && title[1].trim() === fields.email_subject.trim()) {
      next = before + text.slice(title[0].length).replace(/^\s*\r?\n/, "\n");
    }
  }
  if (extractStandaloneEmailBody(next) !== oldBody)
    throw Error("Không thể làm gọn ghi chú mà vẫn giữ nguyên nội dung email. Ghi chú chưa được thay đổi.");
  return next;
}
function parseStandalonePlan(file, fields, markdown) {
  if (!file || typeof file.path !== "string" || !file.path.startsWith(ROOT2) || file.extension !== "md") {
    throw Error("Open an Email Plan in the HakiSend Emails folder.");
  }
  if (fields.hakisend_type !== "email_campaign" || fields.hakisend_email_kind !== "standalone") {
    throw Error("Only Standalone Email Plans can use this private Draft API. Post-linked emails remain local.");
  }
  if (fields.hakisend_import_snapshot === true || fields.hakisend_read_only === true) {
    throw Error("Read-only imported notes cannot be used for writing.");
  }
  if (!validUuid(fields.site_uid)) throw Error("Invalid Site UID");
  const subject = fields.email_subject;
  if (typeof subject !== "string" || !subject.trim() || byteLength(subject) > 255) {
    throw Error("Email subject is missing or too long.");
  }
  const preheader = fields.email_preheader == null ? "" : fields.email_preheader;
  if (typeof preheader !== "string" || byteLength(preheader) > 255) throw Error("Invalid preheader.");
  const body = extractStandaloneEmailBody(markdown);
  if (!body || body.includes("Write the standalone email here.") || body.includes("Viết nội dung email của bạn ở đây.") || byteLength(body) > 2e5 || body.includes("\0")) {
    throw Error("Hãy thay dòng hướng dẫn bằng nội dung email thực tế trước khi lưu.");
  }
  const draftUid = fields.hakisend_remote_email_draft_uid || "";
  const requestUid = fields.hakisend_remote_email_request_uid || "";
  const revision = fields.hakisend_remote_email_revision;
  if (draftUid !== "" && !validUuid(draftUid)) throw Error("Invalid saved remote Draft UID.");
  if (requestUid !== "" && !validUuid(requestUid)) throw Error("Invalid saved request UID.");
  if (draftUid && (!Number.isInteger(revision) || revision < 1)) {
    throw Error("Remote Draft revision is missing. Open the remote Draft for recovery.");
  }
  const listUid = fields.email_list_uid || "";
  if (typeof listUid !== "string") throw Error("Invalid Email audience.");
  return {
    siteUid: fields.site_uid.toLowerCase(),
    subject: subject.trim(),
    preheader,
    body,
    listUid,
    draftUid,
    requestUid,
    revision: typeof revision === "number" ? revision : void 0
  };
}
function isAudience(value) {
  if (typeof value !== "object" || value === null) return false;
  const item = value;
  return typeof item.uid === "string" && LIST_UID.test(item.uid) && typeof item.name === "string";
}
function createDraftMutation(plan, authorized, selectedListUid) {
  var _a;
  if (!LIST_UID.test(selectedListUid) || !authorized.some((a) => isAudience(a) && a.uid === selectedListUid)) {
    throw Error("The audience is no longer enabled for this Site.");
  }
  if (plan.listUid && plan.listUid !== selectedListUid) {
    throw Error("Saved/requested Draft audience cannot change.");
  }
  if (plan.draftUid) {
    if (!validUuid(plan.draftUid) || !Number.isInteger(plan.revision) || ((_a = plan.revision) != null ? _a : 0) < 1) {
      throw Error("Cannot update a Draft without its exact server revision.");
    }
    return {
      method: "PUT",
      suffix: `drafts/${plan.draftUid.toLowerCase()}`,
      payload: { revision: plan.revision, subject: plan.subject, preheader: plan.preheader, body_markdown: plan.body }
    };
  }
  if (!validUuid(plan.requestUid)) throw Error("Persist a stable request UID before creating a private Draft.");
  return {
    method: "POST",
    suffix: "drafts",
    payload: {
      request_uid: plan.requestUid.toLowerCase(),
      list_uid: selectedListUid,
      subject: plan.subject,
      preheader: plan.preheader,
      body_markdown: plan.body
    }
  };
}
function validDraftSummary(value) {
  if (typeof value !== "object" || value === null) return false;
  const draft = value;
  return validUuid(draft.uid) && typeof draft.subject === "string" && Number.isInteger(draft.revision) && draft.revision >= 1 && draft.status === "private_draft" && draft.send_enabled === false;
}
function verifyDraftReadback(plan, mutationResult, readback) {
  var _a;
  if (!validDraftSummary(mutationResult) || !validDraftSummary(readback)) {
    throw Error("Remote private Draft status is not verified; do not retry automatically.");
  }
  if (mutationResult.uid !== readback.uid || mutationResult.revision !== readback.revision || readback.subject !== plan.subject || readback.body_markdown !== plan.body) {
    throw Error("Draft saved but readback differs; inspect remote before retrying.");
  }
  if (plan.draftUid && readback.uid.toLowerCase() !== plan.draftUid.toLowerCase()) {
    throw Error("Remote Draft UID changed unexpectedly.");
  }
  if (plan.draftUid && readback.revision !== ((_a = plan.revision) != null ? _a : 0) + 1) {
    throw Error("Remote Draft revision increment mismatch.");
  }
  if (!plan.draftUid && (readback.revision !== 1 || readback.request_uid !== plan.requestUid)) {
    throw Error("Created Draft identity or revision mismatch; do not retry.");
  }
  return readback;
}
function verifiedCallout(revision) {
  if (!Number.isInteger(revision) || revision < 1) throw Error("Invalid remote revision.");
  return `> [!success] Saved on HakiSend \xB7 Private Draft \xB7 Revision ${revision} \u2014 NOT sent`;
}
function decorateLocalPlan(markdown, revision) {
  const replacement = verifiedCallout(revision);
  const original = "> [!warning] Email plan \u2014 local draft, NOT sent or scheduled on HakiSend";
  const localized = "> [!warning] Bản nháp email — chưa gửi";
  const previous = /^> \[!success\] Saved on HakiSend · Private Draft · Revision [1-9]\d* — NOT sent$/m;
  if (markdown.includes(original)) return markdown.replace(original, replacement);
  if (markdown.includes(localized)) return markdown.replace(localized, replacement);
  if (previous.test(markdown)) return markdown.replace(previous, replacement);
  return markdown;
}
function isRevisionConflict(value) {
  return value instanceof Error && /revision_conflict/.test(value.message) && /\b409\b/.test(value.message);
}
function canAdoptRevision(localUid, localRevision, remote, expectedRemoteRevision) {
  return validUuid(localUid) && Number.isInteger(localRevision) && localRevision >= 1 && validDraftSummary(remote) && remote.uid.toLowerCase() === localUid.toLowerCase() && remote.revision === expectedRemoteRevision && remote.revision > localRevision;
}

// src/multichannel/r3-distribution-contract.ts
var UUID9 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var LIST2 = /^[A-Za-z0-9_.:-]{3,191}$/;
var PAGE = /^[1-9][0-9]{4,24}$/;
var TEMPLATE = /^[A-Za-z0-9_.:/-]{2,191}$/;
var FREE_START = "<!-- hakisend:free:start -->";
var FREE_END = "<!-- hakisend:free:end -->";
function requireField(x, name, max = 255) {
  if (typeof x !== "string" || !x.trim() || x.length > max || /[\x00-\x1f\x7f]/.test(x))
    throw Error("Invalid " + name);
  return x.trim();
}
function requirePath(x, mode) {
  const v = requireField(x, "editable Markdown path", 1024);
  if (!v.endsWith(".md") || v.startsWith("/") || v.includes("\\") || v.split("/").some((p) => !p || p === "." || p === "..") || v.startsWith("HakiSend Imports/") || mode !== "email_only" && v.startsWith("HakiSend Emails/"))
    throw Error("Source must be an editable Markdown note, not an imported snapshot.");
  return v;
}
function stripR3Frontmatter(raw) {
  if (typeof raw !== "string" || raw.length > 25e4 || raw.includes("\0"))
    throw Error("Invalid Markdown source.");
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return text.trim();
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) throw Error("Unclosed YAML frontmatter.");
  return text.slice(end + 5).trim();
}
function extractMarkedFreeBlock(raw) {
  const lines = stripR3Frontmatter(raw).split("\n");
  let start = -1, end = -1, fence = false, invalidFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(String.fromCharCode(96).repeat(3)) || line.startsWith("~~~")) fence = !fence;
    if (line.includes("hakisend:free:")) {
      if (fence) invalidFence = true;
      if (line === FREE_START) {
        if (start >= 0 || end >= 0) throw Error("Duplicate/misplaced Free start marker.");
        start = i;
      } else if (line === FREE_END) {
        if (start < 0 || end >= 0) throw Error("Unbalanced Free end marker.");
        end = i;
      } else throw Error("Malformed Free content marker.");
    }
  }
  if (invalidFence || fence) throw Error("Ambiguous Free marker inside Markdown code fence.");
  if (start < 0 || end <= start) throw Error("Post Free Email requires exactly one explicit Free block.");
  const free = lines.slice(start + 1, end).join("\n").trim();
  if (!free) throw Error("Free block cannot be empty.");
  if (/<!--\s*(?:hakisend:(?:paid|premium|member)|members?[-_: ]only|paywall)\b/i.test(free))
    throw Error("Paid/membership marker found inside Free block.");
  return free;
}
/**
 * Prepare a Post announcement as an editable Standalone Email Plan.
 * The excerpt is read from the anonymous public page after Membership applies
 * its Site/Category/Post policy. Local Post Markdown is never a teaser source.
 */
function publishedPostStatus(value) {
  return typeof value === "string" && ["published", "publish"].includes(value.trim().toLowerCase());
}
function publishedPostCategory(fields) {
  if (!fields || typeof fields !== "object") return "";
  const candidate = typeof fields.category === "string" && fields.category.trim() ? fields.category :
    typeof fields.categories === "string" ? fields.categories :
    Array.isArray(fields.categories) && fields.categories.length === 1 ? fields.categories[0] : "";
  return typeof candidate === "string" && /^[a-z0-9][a-z0-9_-]*$/i.test(candidate.trim()) ? candidate.trim().toLowerCase() : "";
}
/** Public Site origin is a Site-level value, never an author-entered Post URL. */
function normalizePublicSiteOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const raw = value.trim();
    const u = new URL(raw.includes("://") ? raw : "https://" + raw);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || !host.includes(".") || host === "app.hakisend.com" ||
      host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") ||
      u.username || u.password || u.port || u.search || u.hash || (u.pathname && u.pathname !== "/"))
      return "";
    return u.origin;
  } catch { return ""; }
}
function publicOriginForSite(site, settings, siteUid) {
  if (!site || !siteUid || site.uid !== siteUid) return "";
  // A present public_origin is the live, owner-checked source from Sites API.
  // A null origin means there is no confirmed public URL; never override it
  // with a potentially stale, per-Vault manual setting.
  if (Object.prototype.hasOwnProperty.call(site, "public_origin"))
    return normalizePublicSiteOrigin(site.public_origin);
  const override = settings?.sitePublicOrigins?.[siteUid];
  if (typeof override === "string" && override.trim()) return normalizePublicSiteOrigin(override);
  const fields = ["public_origin", "public_domain", "primary_domain", "custom_domain", "domain", "website_url", "site_url", "homepage_url", "public_url", "url"];
  for (const key of fields) {
    const candidate = normalizePublicSiteOrigin(site[key]);
    if (candidate) return candidate;
  }
  return "";
}
function autoPublishedPostUrl(site, settings, siteUid, fields, file) {
  const origin = publicOriginForSite(site, settings, siteUid);
  if (!origin) return "";
  const category = publishedPostCategory(fields);
  const explicitSlug = typeof fields?.slug === "string" ? fields.slug.trim() : "";
  if (explicitSlug && !/^[a-z0-9][a-z0-9_-]{1,190}$/i.test(explicitSlug)) return "";
  const rawSlug = simpleSlug(explicitSlug ||
    (typeof fields?.title === "string" && fields.title.trim() ? fields.title : file?.basename || ""));
  if (!category || !/^[a-z0-9][a-z0-9_-]{1,190}$/i.test(rawSlug)) return "";
  const path = "/" + category + "/" + rawSlug;
  const pinned = typeof fields?.public_url === "string" ? fields.public_url : "";
  if (pinned) {
    try {
      const u = new URL(pinned);
      if (u.protocol === "https:" && u.origin === origin &&
        u.pathname.replace(/\/+$/, "") === path && !u.search && !u.hash && !u.username && !u.password)
        return u.href;
    } catch {}
  }
  return origin + path;
}
/** Resolve only the precise Post returned by the authorized HakiSend API. */
function verifiedServerPostUrl(row, site, settings, siteUid, externalId) {
  if (!row || typeof row !== "object" || !validUuid(row.uid) ||
    row.site_uid !== siteUid || row.external?.source !== "obsidian" ||
    row.external?.id !== externalId)
    throw Error("HakiSend trả về Post không khớp Site hoặc external_id của bài viết.");
  if (row.status !== "published") throw Error("Post trên HakiSend chưa ở trạng thái đã xuất bản.");
  const category = typeof row.category_slug === "string" ? row.category_slug : "";
  const slug = typeof row.slug === "string" ? row.slug : "";
  const title = typeof row.title === "string" ? row.title.trim() : "";
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(category) ||
    !/^[a-z0-9][a-z0-9_-]{1,190}$/.test(slug) || !title || title.length > 200)
    throw Error("HakiSend chưa có Category, Slug hoặc tiêu đề hợp lệ cho Post.");
  const origin = publicOriginForSite(site, settings, siteUid);
  if (!origin || !row.public_url) throw Error("Post chưa có URL công khai hợp lệ trên Site đã xuất bản.");
  let url;
  try { url = new URL(row.public_url); } catch { throw Error("URL Post do HakiSend trả về không hợp lệ."); }
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password ||
    url.port || url.search || url.hash || url.pathname !== "/" + category + "/" + slug)
    throw Error("URL của Post không khớp domain, Category và Slug chính thức trên HakiSend.");
  return { uid: row.uid, title, categorySlug: category, slug, publicUrl: url.href };
}
/** Accept a slug only when the Post upsert response explicitly returns one. */
function authoritativePublishedSlug(postResponse) {
  if (!postResponse || typeof postResponse !== "object") return "";
  const candidates = [
    postResponse.slug,
    postResponse.post?.slug,
    postResponse.metadata?.slug,
    postResponse.post?.metadata?.slug
  ];
  const slug = candidates.find((value) => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{1,190}$/i.test(value));
  return slug || "";
}
function createPublishedPostEmailNotice(input) {
  if (!input || typeof input !== "object" || !validUuid(input.siteUid))
    throw Error("Chưa xác định được HakiSend Site của bài viết.");
  if (!publishedPostStatus(input.status))
    throw Error("Hãy xuất bản bài viết trên HakiSend trước khi tạo email thông báo.");
  if (typeof input.sourcePath !== "string" || !input.sourcePath.endsWith(".md") ||
    input.sourcePath.startsWith("HakiSend Emails/") || input.sourcePath.startsWith("HakiSend Imports/") ||
    input.sourcePath.startsWith("/") || input.sourcePath.includes("\\") ||
    input.sourcePath.split("/").some((part) => !part || part === "." || part === ".."))
    throw Error("Chỉ dùng bài viết gốc đang có quyền chỉnh sửa trong Obsidian.");
  if (input.readOnly === true) throw Error("Không tạo email từ bản sao chỉ đọc.");
  const title = requireField(input.postTitle, "Post title", 200);
  if (!validUuid(input.postUid)) throw Error("Post UID từ HakiSend không hợp lệ.");
  const subject = requireField(input.subject, "Email subject", 255);
  const preheader = input.preheader == null ? "" : input.preheader;
  if (typeof preheader !== "string" || new TextEncoder().encode(preheader).length > 255 || /[\r\n\0]/.test(preheader))
    throw Error("Dòng xem trước email không hợp lệ.");
  const url = new URL(String(input.publicUrl || ""));
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.search ||
    !url.hostname || url.hostname === "localhost" || url.hostname === "app.hakisend.com" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(":"))
    throw Error("Hãy nhập URL HTTPS của bài viết công khai, không chứa tham số.");
  const category = requireField(input.category, "Post Category", 191).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(category) ||
    !url.pathname.startsWith("/" + category + "/") || url.pathname.slice(category.length + 2).length < 2)
    throw Error("URL phải thuộc chuyên mục của bài viết trên Site đã chọn.");
  if (typeof input.postSlug === "string" && input.postSlug.trim() &&
    url.pathname.replace(/\/+$/, "").split("/").pop() !==
      (input.serverVerified === true ? input.postSlug.trim() : simpleSlug(input.postSlug.trim())))
    throw Error("Slug trong URL không khớp Slug của bài viết gốc.");
  if (input.confirmedPublic !== true)
    throw Error("Hãy kiểm tra URL ở cửa sổ ẩn danh và xác nhận phần trích dẫn là công khai.");
  if (typeof input.sourceMarkdown !== "string") throw Error("Không đọc được nội dung bài viết.");
  if (input.guestPreviewVerified !== true || input.excerptSource !== "membership_guest_page")
    throw Error("Chưa nhận được trích đoạn công khai đã được Membership kiểm tra.");
  const excerpt = typeof input.publicExcerpt === "string" ? input.publicExcerpt.trim() : "";
  const summary = typeof input.publicSummary === "string" ? input.publicSummary.trim() : "";
  const freeContent = typeof input.publicFreeContent === "string" ? input.publicFreeContent.trim() : "";
  const excerptSource = "membership_guest_page";
  if (new TextEncoder().encode(excerpt).length > 1e5 ||
    /(?:\{\{|\{%|\[\[|!\[\[|(?:obsidian|file):\/\/)/i.test(excerpt) ||
    /<!--\s*(?:hakisend:|members?[-_: ]only|paywall)\b|<\/?(?:script|iframe|form|style|object|embed)\b/i.test(excerpt))
    throw Error("Trích đoạn công khai chứa nội dung động, liên kết nội bộ hoặc quá dài.");
  const introduction = typeof input.introduction === "string" ? input.introduction.trim() : "";
  if (new TextEncoder().encode(introduction).length > 2e3 || /(?:\{\{|\{%|\[\[|<!--\s*hakisend:|\0)/i.test(introduction))
    throw Error("Lời dẫn không hợp lệ hoặc quá dài.");
  if ((summary || freeContent) && [summary, freeContent].filter(Boolean).join("\n\n") !== excerpt)
    throw Error("Hai phần nội dung công khai đã thay đổi, cần tải lại trang khách.");
  // These human-readable headings are an explicit Post-email section contract
  // for Publisheremail >=0.6.18. Legacy email rendering stays understandable.
  const content = summary || freeContent
    ? "## Tóm tắt bài viết\n\n" + summary + "\n\n## Nội dung đọc miễn phí\n\n" + freeContent
    : excerpt;
  const body = [introduction, content, "[Đọc toàn bộ bài viết](" + url.href + ")"].filter(Boolean).join("\n\n");
  const plan = createEmailOnlyPlanFromMarkdown({
    siteUid: input.siteUid,
    listUid: input.listUid,
    subject,
    preheader,
    originalPath: input.sourcePath,
    sourceMarkdown: body
  });
  const anchor = "email_store_on_hakisend: false";
  if (!plan.planMarkdown.includes(anchor)) throw Error("Email Plan format changed; no draft created.");
  const safeListName = typeof input.listName === "string" ? input.listName.replace(/[\r\n<>]/g, " ").trim().slice(0, 100) : "";
  const identified = plan.planMarkdown.replace('email_list_name: ""',
    "email_list_name: " + JSON.stringify(safeListName));
  return {
    ...plan,
    excerpt,
    excerptSource,
    publicUrl: url.href,
    planMarkdown: identified.replace(anchor,
      "hakisend_post_notice_source_path: " + JSON.stringify(input.sourcePath) + "\n" +
      "hakisend_post_notice_post_uid: " + JSON.stringify(input.postUid.toLowerCase()) + "\n" +
      "hakisend_post_notice_excerpt_source: " + JSON.stringify(excerptSource) + "\n" +
      "hakisend_post_notice_public_url: " + JSON.stringify(url.href) + "\n" + anchor)
  };
}
/**
 * Parse ONLY the visible article body of the anonymous published page.
 * The Membership server has already truncated protected HTML and appended its
 * paywall card. Strip that card and unsafe elements; never read local Markdown.
 */
function publicMembershipExcerptFromPage(pageHtml, postTitle, expectedUrl) {
  if (typeof pageHtml !== "string" || pageHtml.length > 2e6 || typeof DOMParser !== "function")
    throw Error("Không thể đọc an toàn nội dung từ trang công khai.");
  const doc = new DOMParser().parseFromString(pageHtml, "text/html");
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "";
  if (!canonical) throw Error("Trang công khai chưa có URL canonical để đối chiếu.");
  const actual = new URL(canonical);
  const expected = new URL(expectedUrl);
  if (actual.protocol !== "https:" || actual.origin !== expected.origin ||
    actual.pathname.replace(/\/+$/, "") !== expected.pathname.replace(/\/+$/, "") ||
    actual.search || actual.hash)
    throw Error("URL canonical không khớp bài viết HakiSend đã chọn.");
  const heading = doc.querySelector("main.hs-article-shell article.hs-article-main h1.hs-article-title");
  if (!heading || !publicPostPageShowsTitle(String(heading.textContent || ""), postTitle))
    throw Error("Tiêu đề bài viết trên trang công khai không khớp.");
  const roots = doc.querySelectorAll("main.hs-article-shell article.hs-article-main .hs-user-content.hs-themed-content[data-hs-resource]");
  if (roots.length !== 1) throw Error("Không tìm thấy đúng một vùng nội dung công khai của Post.");
  const article = roots[0];
  const hasLock = !!article.querySelector('[data-hsm-content-lock="1"]');
  const excluded = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "SVG", "CANVAS", "TEMPLATE"]);
  const blocks = new Set(["P", "DIV", "SECTION", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "TABLE", "TR", "HR", "BR"]);
  const walk = (node, pieces, skipSummary = false) => {
    if (node.nodeType === 3) {
      pieces.push(String(node.nodeValue || "").replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== 1) return;
    if (skipSummary && node.getAttribute("data-hs-excerpt") === "true") return;
    if (excluded.has(node.tagName) || node.hasAttribute("hidden") ||
      node.getAttribute("aria-hidden") === "true" ||
      node.closest('[data-hsm-content-lock="1"]')) return;
    if (blocks.has(node.tagName)) pieces.push(node.tagName === "LI" ? "\n- " : "\n\n");
    for (const child of node.childNodes) walk(child, pieces, skipSummary);
    if (blocks.has(node.tagName)) pieces.push("\n\n");
  };
  const visibleText = (nodes, skipSummary = false) => {
    const pieces = [];
    for (const child of nodes) walk(child, pieces, skipSummary);
    return pieces.join("").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n").trim();
  };
  const summaryRoot = article.querySelector('[data-hs-excerpt="true"]');
  const visibleSummary = summaryRoot && !summaryRoot.closest('[data-hsm-content-lock="1"]') &&
    !summaryRoot.closest('[hidden]') && !summaryRoot.closest('[aria-hidden="true"]')
    ? visibleText([summaryRoot]) : "";
  const visibleFree = visibleText(article.childNodes, true);
  if (!hasLock && !visibleSummary && !visibleFree)
    throw Error("Bài viết công khai không có nội dung để trích dẫn.");
  // Never silently truncate the guest-visible Free content: the full text is
  // either included, or this draft must be reviewed through another workflow.
  const summary = visibleSummary;
  const freeContent = visibleFree;
  const excerpt = [summary, freeContent].filter(Boolean).join("\n\n");
  if (new TextEncoder().encode(excerpt).length > 1e5)
    throw Error("Nội dung Free vượt 100 KB. Không được cắt ngắn email âm thầm; hãy chia nội dung hoặc dùng liên kết bài viết.");
  return { excerpt, summary, freeContent, hasLock, shortened: false,
    canonicalUrl: actual.href, excerptSource: "membership_guest_page" };
}
function publicPostPageShowsTitle(page, title) {
  if (typeof page !== "string" || page.length > 2e6 || typeof title !== "string" || !title.trim()) return false;
  const decode = (s) => s.replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, code) => {
    const n = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return Number.isSafeInteger(n) && n > 0 && n <= 1114111 && !(n >= 55296 && n <= 57343) ? String.fromCodePoint(n) : entity;
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/gi, (entity, name) => ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " })[name.toLowerCase()] || entity);
  const norm = (s) => decode(s).normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const visible = norm(page.replace(/<[^>]+>/g, " "));
  const raw = norm(page);
  const legacyTitle = title.replace(/^[\s“”"']+|[\s“”"'_]+$/g, "").trim();
  const opening = legacyTitle.split(/\s+[—–]\s+/)[0].replace(/^[“”"']+|[“”"']+$/g, "").trim();
  const candidates = [title, legacyTitle, opening.length >= 24 ? opening : ""].filter(Boolean);
  return candidates.some((candidate) => raw.includes(norm(candidate)) || visible.includes(norm(candidate)));
}
function r3UtcSchedule(when, now = /* @__PURE__ */ new Date()) {
  var _a;
  if (when === void 0 || when === "") return null;
  const m = typeof when === "string" ? /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(when) : null;
  if (!m) throw Error("Schedule requires ISO 8601 with explicit timezone.");
  const yr = +m[1], mo = +m[2], day = +m[3], hh = +m[4], min = +m[5], sec = +((_a = m[6]) != null ? _a : 0);
  const z = m[7], oh = z === "Z" ? 0 : +z.slice(1, 3), om = z === "Z" ? 0 : +z.slice(4, 6);
  if (yr < 2020 || mo < 1 || mo > 12 || day < 1 || day > new Date(Date.UTC(yr, mo, 0)).getUTCDate() || hh > 23 || min > 59 || sec > 59 || oh * 60 + om > 840) throw Error("Invalid calendar date or timezone.");
  const ms = Date.parse(when);
  if (!Number.isFinite(ms) || ms <= now.getTime()) throw Error("Schedule must be in the future.");
  return new Date(ms).toISOString();
}
function createR3LocalPlan(input, now = /* @__PURE__ */ new Date()) {
  var _a;
  if (!input || input.mode !== "post" && input.mode !== "email_only" || !Array.isArray(input.lists) || input.lists.length > 1 || !Array.isArray(input.pages) || input.pages.length !== 0)
    throw Error("Invalid R3 plan: select at most one Email List; Facebook publishing is deferred.");
  const id2 = requireField(input.siteUid, "Site UID", 36).toLowerCase();
  if (!UUID9.test(id2)) throw Error("Invalid Site UID.");
  const note = requirePath(input.notePath, input.mode);
  let body = stripR3Frontmatter(input.markdown);
  if (input.mode === "email_only" && note.startsWith("HakiSend Emails/")) {
    if (!/^hakisend_email_kind:\s*["']?standalone["']?\s*$/m.test(input.markdown))
      throw Error("Only Standalone Email Plans can be used as Email Only source.");
    body = extractStandaloneEmailBody(input.markdown);
    if (!body || body.includes("Write the standalone email here."))
      throw Error("Replace the standalone email body placeholder.");
  }
  const title = requireField(input.title, "Post or email title", 200);
  if (!body) throw Error("Empty Markdown source.");
  if (input.mode === "email_only" && (input.postScheduledAt || input.pages.length > 0))
    throw Error("Email Only may not publish a Post or Facebook Page.");
  const events = [];
  if (input.mode === "post") events.push({
    kind: "site_post",
    siteUid: id2,
    destinationUid: id2,
    destinationLabel: "HakiSend Site",
    title,
    body,
    sourceNote: note,
    scheduledAtUtc: r3UtcSchedule(input.postScheduledAt, now),
    status: "local_draft"
  });
  const free = input.mode === "post" && input.lists.length ? extractMarkedFreeBlock(input.markdown) : "";
  const lists = /* @__PURE__ */ new Set();
  for (const row of input.lists) {
    const list = requireField(row.listUid, "Email List UID", 191);
    if (!LIST2.test(list) || lists.has(list.toLowerCase())) throw Error("Invalid/duplicate Email List UID.");
    lists.add(list.toLowerCase());
    const template = requireField(row.templateRef, "Email template reference", 191);
    if (!TEMPLATE.test(template)) throw Error("Invalid Email template reference.");
    const sub = requireField(row.subject, "Email subject");
    const pre = (_a = row.preheader) != null ? _a : "";
    if (typeof pre !== "string" || pre.length > 255 || /[\r\n\0]/.test(pre))
      throw Error("Invalid Email preview text.");
    events.push({
      kind: input.mode === "post" ? "post_free_email" : "standalone_email",
      siteUid: id2,
      destinationUid: list,
      destinationLabel: list,
      title: sub,
      body: input.mode === "post" ? free : body,
      templateRef: template,
      preheader: pre,
      status: "local_draft",
      scheduledAtUtc: r3UtcSchedule(row.scheduledAt, now),
      ...input.mode === "post" ? { sourceNote: note } : {}
    });
  }
  if (input.mode === "email_only" && !events.length) throw Error("Select an Email List for Email Only.");
  return {
    schema: "hks_r3_multichannel_plan_v1",
    status: "local_only",
    siteUid: id2,
    mode: input.mode,
    sourceNote: note,
    events,
    warnings: [
      "LOCAL ONLY: no real scheduling, posting or email delivery is performed.",
      "Post Free must be rechecked against guest-visible server content before dispatch.",
      "HakiSend manages subscriber registration in each Email List. Sender identity and the chosen List remain server-verified.",
      "Facebook publishing is deferred and is unavailable in this release."
    ]
  };
}
function renderR3LocalPlan(plan) {
  if (plan.schema !== "hks_r3_multichannel_plan_v1" || plan.status !== "local_only")
    throw Error("Unsafe distribution plan.");
  const fence = String.fromCharCode(96).repeat(3);
  return "# HakiSend R3 \u2014 Distribution Plan\n\n> [!warning] Local plan only \u2014 nothing has been sent, posted or scheduled.\n\n" + fence + "json\n" + JSON.stringify(plan, null, 2) + "\n" + fence + "\n";
}

// src/multichannel/r3-local-calendar.ts
var UUID10 = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
var KINDS = /* @__PURE__ */ new Set(["site_post", "post_free_email", "standalone_email", "facebook_page_post"]);
function obj3(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function readR3LocalPlanNote(note) {
  if (typeof note !== "string" || note.length > 18e5)
    throw Error("Untrusted or oversized distribution plan document.");
  const fence = String.fromCharCode(96).repeat(3);
  const first = note.indexOf(fence + "json\n");
  if (first < 0 || note.indexOf(fence + "json\n", first + 1) >= 0)
    throw Error("Missing or repeated plan JSON section.");
  const from = first + fence.length + 5;
  const end = note.lastIndexOf("\n" + fence);
  if (end <= from) throw Error("Unclosed plan JSON section.");
  let data2;
  try {
    data2 = JSON.parse(note.slice(from, end));
  } catch (e) {
    throw Error("Malformed multichannel plan JSON.");
  }
  if (!obj3(data2) || data2.schema !== "hks_r3_multichannel_plan_v1" || data2.status !== "local_only" || !UUID10.test(String(data2.siteUid)) || !["post", "email_only"].includes(String(data2.mode)) || typeof data2.sourceNote !== "string" || !Array.isArray(data2.events) || data2.events.length > 55 || !Array.isArray(data2.warnings))
    throw Error("Invalid or potentially executable plan.");
  const site = data2.siteUid;
  for (const row of data2.events) {
    if (!obj3(row) || row.status !== "local_draft" || row.siteUid !== site || !KINDS.has(row.kind) || typeof row.title !== "string" || typeof row.destinationUid !== "string" || typeof row.destinationLabel !== "string" || row.scheduledAtUtc !== null && (typeof row.scheduledAtUtc !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.scheduledAtUtc)) || typeof row.body !== "string") throw Error("Invalid local Calendar event.");
    if (data2.mode === "email_only" && row.kind !== "standalone_email")
      throw Error("Email Only note contains an unrelated publishing action.");
  }
  return data2;
}
function r3LocalCalendar(notes, siteFilter = "all", kindFilter = "all") {
  if (notes.length > 500) throw Error("Too many local distribution documents.");
  if (siteFilter !== "all" && !UUID10.test(siteFilter)) throw Error("Unknown Calendar Site filter.");
  if (kindFilter !== "all" && !KINDS.has(kindFilter)) throw Error("Unknown Calendar event type.");
  const entries = [];
  let invalidDocuments = 0;
  for (const note of notes) {
    if (!note || typeof note.path !== "string" || !note.path.startsWith("HakiSend Distribution Plans/") || !note.path.endsWith(".md")) {
      invalidDocuments++;
      continue;
    }
    try {
      const p = readR3LocalPlanNote(note.markdown);
      for (const e of p.events) {
        if ((siteFilter === "all" || e.siteUid === siteFilter) && (kindFilter === "all" || e.kind === kindFilter))
          entries.push({
            siteUid: e.siteUid,
            kind: e.kind,
            title: e.title,
            destinationUid: e.destinationUid,
            destinationLabel: e.destinationLabel,
            scheduledAtUtc: e.scheduledAtUtc,
            status: "local_draft",
            planPath: note.path
          });
      }
    } catch (e) {
      invalidDocuments++;
    }
  }
  entries.sort((a, b) => {
    var _a, _b;
    return ((_a = a.scheduledAtUtc) != null ? _a : "9999").localeCompare((_b = b.scheduledAtUtc) != null ? _b : "9999") || a.siteUid.localeCompare(b.siteUid) || a.title.localeCompare(b.title);
  });
  return { entries, invalidDocuments };
}

// src/email/publisher-r3-read.ts
var SITE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
var CAMPAIGN = /^[a-f0-9]{13}$/i;
var STATES = /* @__PURE__ */ new Set(["new", "scheduled", "queued", "sending", "done", "paused", "error"]);
var obj4 = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function uid(v, re) {
  if (typeof v !== "string" || !re.test(v)) throw Error("Invalid Site or Acelle Campaign identity");
  return v.toLowerCase();
}
function r3Origin(v) {
  const u = new URL(v);
  if (u.protocol !== "https:" || u.pathname !== "/" || u.search || u.hash || u.username || u.password || !u.hostname) throw Error("HTTPS HakiSend origin required");
  return u.origin;
}
function request(origin, site, token, path) {
  if (!token || token.length < 8 || token.length > 8192 || /[\r\n\0]/.test(token)) throw Error("Secure HakiSend OAuth token required");
  return {
    url: r3Origin(origin) + "/api/v1/hakisend/sites/" + uid(site, SITE) + "/publisher" + path,
    method: "GET",
    headers: { Accept: "application/json", Authorization: "Bearer " + token },
    throw: false
  };
}
function data(raw, site, source) {
  if (!obj4(raw) || raw.success !== true || !obj4(raw.data)) throw Error("Unverified Publisher response");
  const d = raw.data;
  if (d.source !== source || d.site_uid !== uid(site, SITE) || d.read_only !== true || d.send_authorized !== false || d.schedule_authorized !== false) throw Error("Unsafe Publisher response");
  return d;
}
function campaign(row) {
  if (!obj4(row) || typeof row.uid !== "string" || !CAMPAIGN.test(row.uid) || typeof row.name !== "string" || !row.name.trim() || row.name.length > 300 || typeof row.status !== "string" || !STATES.has(row.status)) throw Error("Invalid Campaign response");
  return { uid: row.uid.toLowerCase(), name: row.name, status: row.status };
}
async function fetchR3Campaigns(fn, origin, site, token) {
  const res = await fn(request(origin, site, token, "/campaigns"));
  if (res.status !== 200) throw Error("Campaign GET unavailable: HTTP " + res.status);
  const d = data(res.json, site, "publisher_r3_campaign_list_v1");
  if (!Array.isArray(d.campaigns) || d.campaigns.length > 50 || typeof d.truncated !== "boolean") throw Error("Invalid Campaign page");
  const list = d.campaigns.map(campaign);
  if (new Set(list.map((x) => x.uid)).size !== list.length) throw Error("Duplicate Campaign UID");
  return { siteUid: uid(site, SITE), campaigns: list, truncated: d.truncated };
}
async function fetchR3Preflight(fn, origin, site, campaignUid, token) {
  const id2 = uid(campaignUid, CAMPAIGN), res = await fn(request(origin, site, token, "/campaigns/" + id2 + "/preflight"));
  if (res.status !== 200) throw Error("Preflight GET unavailable: HTTP " + res.status);
  const d = data(res.json, site, "publisher_r3_preflight_v1"), c = campaign(d.campaign);
  if (c.uid !== id2 || !obj4(d.checks) || Object.keys(d.checks).length > 24 || !(d.recipient_count === null || typeof d.recipient_count === "number" && Number.isSafeInteger(d.recipient_count) && d.recipient_count >= 0)) throw Error("Mismatched preflight");
  const access = d.delivery_access;
  if (!obj4(access) || typeof access.send_now_available !== "boolean" || typeof access.schedule_available !== "boolean" || !["disabled", "global"].includes(access.mode) || access.mode === "disabled" && (access.send_now_available || access.schedule_available)) throw Error("Server delivery capability unavailable; update HakiSend backend before sending");
  const checks = {};
  for (const [name, value] of Object.entries(d.checks)) {
    if (!/^[a-z_]{3,40}$/.test(name) || !obj4(value) || !["pass", "block", "unknown"].includes(String(value.state)) || typeof value.detail !== "string" || value.detail.length > 700) throw Error("Invalid preflight check");
    checks[name] = { state: value.state, detail: value.detail };
  }
  return { siteUid: uid(site, SITE), campaign: c, recipientCount: d.recipient_count, checks, deliveryAccess: { sendNow: access.send_now_available, schedule: access.schedule_available, mode: access.mode } };
}

// src/email/publisher-r3-delivery.ts
var UUID11 = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
var UID = /^[a-f0-9]{13}$/i;
var JOURNAL = /* @__PURE__ */ new Set(["claimed", "scheduled", "handed_off", "uncertain"]);
var obj5 = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function id(x, re) {
  if (typeof x !== "string" || !re.test(x)) throw Error("Invalid R3 identity");
  return x.toLowerCase();
}
function base(x) {
  const u = new URL(x);
  if (u.protocol !== "https:" || u.pathname !== "/" || u.search || u.hash || u.username || u.password || !u.hostname) throw Error("HTTPS origin required");
  return u.origin;
}
function auth(t) {
  if (!t || t.length < 8 || t.length > 8192 || /[\r\n\0]/.test(t)) throw Error("Explicit email delivery OAuth required");
  return "Bearer " + t;
}
function url(origin, site, campaign2) {
  return base(origin) + "/api/v1/hakisend/sites/" + id(site, UUID11) + "/publisher/campaigns/" + id(campaign2, UID) + "/delivery";
}
function validZone(z) {
  if (z === "UTC") return true;
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(z)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return true;
  } catch (e) {
    return false;
  }
}
function validateR3Payload(action, p) {
  if (action !== "send_now" && action !== "schedule") throw Error("Unknown delivery action");
  if (!obj5(p) || !UUID11.test(p.request_uid) || !Number.isSafeInteger(p.recipient_count_snapshot) || p.recipient_count_snapshot < 1 || p.approval_confirmed !== true) throw Error("Missing deliberate approval");
  if (p.consent_basis !== void 0 || p.consent_source !== void 0) throw Error("R3 uses native HakiSend List rules and accepts no per-campaign consent fields");
  if (action === "send_now" && (p.delivery_date !== void 0 || p.delivery_time !== void 0 || p.timezone !== void 0))
    throw Error("Send Now may not include schedule fields");
  if (action === "schedule" && (!p.delivery_date || !/^\d{4}-\d{2}-\d{2}$/.test(p.delivery_date) || !p.delivery_time || !/^\d{2}:\d{2}$/.test(p.delivery_time) || !p.timezone || !validZone(p.timezone) || Number(p.delivery_time.slice(0, 2)) > 23 || Number(p.delivery_time.slice(3)) > 59)) throw Error("A valid date/time/timezone is required");
}
function receipt(raw, site, campaign2, req, action) {
  if (!obj5(raw) || raw.success !== true || !obj5(raw.data)) throw Error("Unverified delivery receipt");
  const d = raw.data;
  if (d.source !== "publisher_r3_delivery_receipt_v1" || d.site_uid !== id(site, UUID11) || d.campaign_uid !== id(campaign2, UID) || d.request_uid !== id(req, UUID11) || d.action !== action || !JOURNAL.has(String(d.journal_status)) || !Number.isSafeInteger(d.recipient_count) || d.recipient_count < 1 || d.may_retry !== false || d.inbox_delivered !== false) throw Error("Unsafe delivery receipt; do not retry");
  // The current HakiSend database exposes UTC DATETIME as "YYYY-MM-DD HH:mm:ss".
  // Append Z explicitly; JavaScript otherwise assumes the computer's local zone.
  const storedTime = typeof d.run_at_utc === "string" ? d.run_at_utc.trim() : "";
  const utcTime = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(storedTime)
    ? storedTime.replace(" ", "T") + "Z"
    : storedTime;
  return {
    siteUid: site,
    campaignUid: campaign2,
    requestUid: req,
    action,
    journalStatus: d.journal_status,
    recipientCount: d.recipient_count,
    ...typeof d.native_status === "string" ? { nativeStatus: d.native_status } : {},
    ...utcTime && !Number.isNaN(Date.parse(utcTime)) ? { runAtUtc: utcTime } : {}
  };
}
// Only a validated, identity-pinned receipt may upgrade a local delivery state.
// A missing receipt is an unknown outcome, never permission to resend.
function r3DeliveryDisplay(verified, intent) {
  if (verified && (verified.siteUid !== intent.siteUid || verified.campaignUid !== intent.campaignUid || verified.requestUid !== intent.requestUid || verified.action !== intent.action))
    throw Error("Delivery receipt identity changed; local status not updated.");
  if (!verified) return { level: "warning", state: "needs_review", label: "Chưa xác định kết quả · cần đối chiếu trên HakiSend · không gửi lại" };
  const native = String(verified.nativeStatus || "").toLowerCase();
  const journal = String(verified.journalStatus || "").toLowerCase();
  if (native === "done")
    return { level: "success", state: "completed", label: "HakiSend đã hoàn tất xử lý gửi · chưa xác nhận thư đến hộp thư" };
  if (journal === "uncertain" || journal === "claimed" || native === "error" || native === "failed")
    return { level: "warning", state: "needs_review", label: "Cần kiểm tra trạng thái trên HakiSend · không gửi lại" };
  if (native === "new")
    return { level: "warning", state: "needs_review", label: "Yêu cầu đã ghi nhận nhưng email vẫn ở trạng thái nháp trên HakiSend · cần đối chiếu, không gửi lại" };
  if (native === "sending" || native === "queued")
    return { level: "info", state: "processing", label: "HakiSend đang xử lý gửi email" };
  if (native === "scheduled" || journal === "scheduled") {
    let when = "";
    if (verified.runAtUtc) {
      try {
        if (native === "scheduled" && Date.parse(verified.runAtUtc) < Date.now() - 15 * 60 * 1e3)
          return { level: "warning", state: "needs_review", label: "Đã quá giờ hẹn nhưng HakiSend vẫn báo chờ gửi · cần kiểm tra, không gửi lại" };
        when = " · " + new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(verified.runAtUtc)) + " (giờ Việt Nam)";
      } catch (e) {}
    }
    return { level: "info", state: "scheduled", label: "Đã đặt lịch gửi trên HakiSend" + when };
  }
  if (journal === "handed_off")
    return { level: "info", state: "processing", label: "HakiSend đã tiếp nhận yêu cầu gửi · đang chờ kết quả" };
  return { level: "warning", state: "needs_review", label: "Trạng thái đang cần đối chiếu trên HakiSend · không gửi lại" };
}
function r3DecorateDeliveryState(markdown, display, summary = {}) {
  const next = `> [!${display.level}] HakiSend · Trạng thái gửi: ${display.label}`;
  const current = /^> \[!(?:success|warning|info)\] HakiSend · Trạng thái gửi: [^\r\n]*$/m;
  let result = markdown;
  if (current.test(result)) result = result.replace(current, next);
  const saved = /^> \[!success\] Saved on HakiSend · Private Draft · Revision [1-9]\d* — NOT sent$/m;
  if (saved.test(result)) result = result.replace(saved, next);
  const initial = /^> \[!warning\] (?:Bản nháp email — chưa gửi|Email plan — local draft, NOT sent or scheduled on HakiSend)$/m;
  if (initial.test(result)) result = result.replace(initial, next);
  const marker = "<!-- hakisend:email-body:start -->";
  if (!result.includes(next)) {
    if (!result.includes(marker)) throw Error("Không tìm thấy vị trí hiển thị trạng thái email. Không sửa ghi chú.");
    result = result.replace(marker, next + "\n\n" + marker);
  }
  const guidance = {
    scheduled: "HakiSend đã xác nhận lịch gửi này. Bạn có thể cập nhật trạng thái bất cứ lúc nào bằng lệnh 'HakiSend: Cập nhật trạng thái gửi email'.",
    processing: "HakiSend đang xử lý yêu cầu. Bạn có thể tiếp tục công việc và kiểm tra kết quả sau.",
    completed: "HakiSend đã hoàn tất xử lý gửi. Bạn có thể xem thông tin giao nhận chi tiết trên HakiSend.",
    needs_review: "Kết quả cần được đối chiếu trên HakiSend. Đừng thực hiện thao tác gửi lại email này."
  };
  const guideLine = "> " + guidance[display.state];
  const oldGuide = /^> Viết email bên dưới\. Khi xong, (?:nhấn biểu tượng máy bay giấy HakiSend hoặc chọn lệnh '2\. Tiếp tục gửi email'|chọn nút Email HakiSend để tiếp tục gửi)\.$/m;
  const currentGuide = /^> (?:HakiSend đã xác nhận lịch gửi này\.|HakiSend đang xử lý yêu cầu\.|HakiSend đã hoàn tất xử lý gửi\.|Kết quả cần được đối chiếu trên HakiSend\.)[^\r\n]*$/m;
  if (oldGuide.test(result)) result = result.replace(oldGuide, guideLine);
  else if (currentGuide.test(result)) result = result.replace(currentGuide, guideLine);
  const siteName = String(summary.siteName || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 100);
  const listName = String(summary.listName || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 100);
  const count = Number.isSafeInteger(summary.recipientCount) && summary.recipientCount > 0 ? summary.recipientCount : 0;
  if (siteName && count) {
    const friendly = "> **Trang:** " + siteName + (listName ? " · **Danh sách:** " + listName : "") + " · **Người nhận hợp lệ:** " + count;
    const existing = /^> \*\*Trang:\*\* [^\r\n]*$/m;
    if (existing.test(result)) result = result.replace(existing, friendly);
    else result = result.replace(next, next + "\n" + friendly);
  }
  return result;
}
async function sendR3Once(fn, origin, site, campaign2, token, action, p, persist) {
  validateR3Payload(action, p);
  const request2 = {
    url: url(origin, site, campaign2) + (action === "send_now" ? "/send-now" : "/schedule"),
    method: "POST",
    headers: { Accept: "application/json", Authorization: auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(p),
    throw: false
  };
  await persist({ siteUid: site, campaignUid: campaign2, requestUid: p.request_uid, action });
  let result;
  try {
    result = await fn(request2);
  } catch (e) {
    throw Error("Delivery outcome unknown: use receipt GET, NEVER retry POST");
  }
  if (result.status !== 202) {
    const code = result.json?.error?.code;
    const safeCode = typeof code === "string" && /^DELIVERY_[A-Za-z0-9_]{1,96}$/.test(code)
      ? " (" + code + ")" : "";
    throw Error("HTTP " + result.status + safeCode + ": recover via receipt GET, never resend");
  }
  const r = receipt(result.json, site, campaign2, p.request_uid, action);
  if (r.recipientCount !== p.recipient_count_snapshot) throw Error("Recipient count mismatch: reconcile via GET");
  return r;
}
async function readR3Receipt(fn, origin, i, token) {
  const req = {
    url: url(origin, i.siteUid, i.campaignUid) + "/receipts/" + id(i.requestUid, UUID11),
    method: "GET",
    headers: { Accept: "application/json", Authorization: auth(token) },
    throw: false
  };
  const result = await fn(req);
  if (result.status !== 200) throw Error("Receipt unavailable; DO NOT resend (HTTP " + result.status + ")");
  return receipt(result.json, i.siteUid, i.campaignUid, i.requestUid, i.action);
}

// src/email/r3-pending-recovery.ts
var UUID12 = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
var CAMPAIGN2 = /^[a-f0-9]{13}$/i;
var obj6 = (x) => !!x && typeof x === "object" && !Array.isArray(x);
function knownPendingR3Receipts(raw, authorizedSites) {
  if (raw === void 0 || raw === null) return { intents: [], ignored: 0 };
  if (!obj6(raw) || Object.keys(raw).length > 1e3)
    throw Error("Corrupted/oversized R3 delivery intent storage. Do not resend.");
  const authorized = new Set(authorizedSites.map((s) => s.uid.toLowerCase()));
  const intents = [];
  let ignored = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const [key, v] of Object.entries(raw)) {
    if (!obj6(v) || typeof v.siteUid !== "string" || !UUID12.test(v.siteUid) || typeof v.campaignUid !== "string" || !CAMPAIGN2.test(v.campaignUid) || typeof v.requestUid !== "string" || !UUID12.test(v.requestUid) || v.action !== "send_now" && v.action !== "schedule" || !authorized.has(v.siteUid.toLowerCase()) || key !== v.siteUid + ":" + v.campaignUid || seen.has(v.siteUid + ":" + v.campaignUid)) {
      ignored++;
      continue;
    }
    seen.add(key);
    intents.push({
      siteUid: v.siteUid,
      campaignUid: v.campaignUid,
      requestUid: v.requestUid,
      action: v.action
    });
  }
  intents.sort((a, b) => a.siteUid.localeCompare(b.siteUid) || a.campaignUid.localeCompare(b.campaignUid));
  return { intents, ignored };
}

// src/email/explicit-private-draft-save.ts
var UUID13 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function explicitlySavePrivateDraft(request2) {
  const { io, selectedAudienceUid, authorizedAudiences } = request2;
  const input = request2.plan;
  const plan = { ...input };
  if (!plan.draftUid) {
    if (!plan.requestUid) {
      if (!request2.newRequestUid || !UUID13.test(request2.newRequestUid)) {
        throw Error("Cryptographic request UID required for first private Draft creation.");
      }
      plan.requestUid = request2.newRequestUid.toLowerCase();
    }
  }
  const mutation = createDraftMutation(plan, authorizedAudiences, selectedAudienceUid);
  if (!plan.draftUid) {
    await io.persistCreateIdentity(plan.requestUid, selectedAudienceUid);
  } else {
    const remote = await io.getRemoteDraft(plan.draftUid);
    if (!validDraftSummary(remote) || remote.uid.toLowerCase() !== plan.draftUid.toLowerCase() || remote.revision !== plan.revision || remote.subject.length > 255) {
      throw Error("Private Draft revision changed; review the remote content before editing.");
    }
  }
  const response = await io.mutateRemote(mutation);
  if (!validDraftSummary(response)) {
    throw Error("Private Draft mutation outcome unknown; inspect server before retrying.");
  }
  const serverDraft = await io.getRemoteDraft(response.uid);
  const verified = verifyDraftReadback(plan, response, serverDraft);
  await io.persistVerifiedReceipt(verified);
  return verified;
}

// src/email/manual-conflict-adoption.ts
function verifyManualConflictAdoption(plan, displayed, fresh) {
  var _a, _b;
  if (!plan.draftUid || !Number.isSafeInteger(plan.revision) || ((_a = plan.revision) != null ? _a : 0) < 1 || !canAdoptRevision(plan.draftUid, (_b = plan.revision) != null ? _b : 0, {
    uid: displayed.uid,
    revision: displayed.revision,
    status: "private_draft",
    send_enabled: false,
    subject: displayed.subject
  }, displayed.revision)) {
    throw Error("A verified, newer server Draft revision is required.");
  }
  if (fresh.uid.toLowerCase() !== displayed.uid.toLowerCase() || fresh.revision !== displayed.revision || fresh.subject !== displayed.subject || fresh.body !== displayed.body) {
    throw Error("Remote Draft changed since conflict review. Reload both versions.");
  }
  if (!Number.isSafeInteger(fresh.revision) || fresh.revision < 1) throw Error("Invalid remote Draft revision.");
  return fresh.revision;
}
function markManualConflictPending(markdown, remoteRevision) {
  if (!Number.isSafeInteger(remoteRevision) || remoteRevision < 1)
    throw Error("Invalid conflict revision.");
  const pending = "> [!warning] Manual conflict review \xB7 Remote base revision " + remoteRevision + " \xB7 Local changes NOT saved to HakiSend";
  const previous = /^> \[!success\] Saved on HakiSend · Private Draft · Revision [1-9]\d* — NOT sent$/m;
  const oldPending = /^> \[!warning\] Manual conflict review · Remote base revision [1-9]\d* · Local changes NOT saved to HakiSend$/m;
  if (previous.test(markdown)) return markdown.replace(previous, pending);
  if (oldPending.test(markdown)) return markdown.replace(oldPending, pending);
  return markdown;
}

// src/email/delivery-readiness.ts
var UUID14 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var ACELLE_UID2 = /^[0-9a-f]{13}$/;
var CHECKS = [
  "source_is_private_draft",
  "owner_and_site_verified",
  "audience_bound_and_readable",
  "native_campaign_ownership_verified",
  "native_campaign_unscheduled_new",
  "native_campaign_single_list",
  "sender_identity_verified",
  "uploaded_template_owned",
  "native_unsubscribe_markup_present"
];
var COMPLIANCE = [
  "unsubscribe",
  "consent",
  "suppression",
  "quota",
  "provider",
  "scheduled_state_receipt",
  "idempotency_handoff",
  "source_revision_at_promotion"
];
var STATUS_KEYS = [
  "subscribed",
  "unsubscribed",
  "blacklisted",
  "spam_reported",
  "unconfirmed",
  "other"
];
var obj7 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function sameUid(value, expected, pattern) {
  return typeof value === "string" && pattern.test(value) && value.toLowerCase() === expected.toLowerCase();
}
function buildReadinessRequest(origin, siteUid, draftUid, requestUid, token) {
  const url2 = new URL(origin);
  if (url2.protocol !== "https:" || !url2.hostname || url2.username || url2.password || url2.pathname !== "/" || url2.search || url2.hash) throw Error("Plain HTTPS HakiSend API origin required.");
  if (!UUID14.test(siteUid) || !UUID14.test(draftUid) || !UUID14.test(requestUid))
    throw Error("Invalid Site/Private Draft/request UID.");
  if (typeof token !== "string" || token.length < 8 || token.length > 8192 || /[\r\n\0]/.test(token))
    throw Error("Authorized bearer token required.");
  return {
    url: url2.origin + "/api/v1/hakisend/sites/" + siteUid.toLowerCase() + "/emails/drafts/" + draftUid.toLowerCase() + "/campaign-drafts/" + requestUid.toLowerCase() + "/readiness",
    method: "GET",
    headers: { Accept: "application/json", Authorization: "Bearer " + token },
    throw: false
  };
}
function parseDeliveryReadiness(envelope, siteUid, draftUid, requestUid, expectedAcelleUid) {
  if (!UUID14.test(siteUid) || !UUID14.test(draftUid) || !UUID14.test(requestUid) || !ACELLE_UID2.test(expectedAcelleUid)) throw Error("Invalid expected identities.");
  if (!obj7(envelope) || envelope.success !== true || !obj7(envelope.data)) {
    throw Error("Readiness unavailable or not owner verified.");
  }
  const d = envelope.data;
  if (d.contract_version !== "hks_delivery_readiness_v1" || !sameUid(d.site_uid, siteUid, UUID14) || !sameUid(d.draft_uid, draftUid, UUID14) || !sameUid(d.request_uid, requestUid, UUID14) || !sameUid(d.campaign_uid, expectedAcelleUid, ACELLE_UID2) || !["new", "ambiguous"].includes(String(d.campaign_state)) || d.ready_to_send !== false || d.send_authorized !== false || d.schedule_authorized !== false || d.read_only !== true || !obj7(d.checks) || !obj7(d.compliance) || !obj7(d.audience_status_counts) || !obj7(d.blacklist_overlap) || !obj7(d.budget_snapshot) || !obj7(d.consent_provenance) || !obj7(d.consent_token_receipts) || Object.keys(d.checks).length !== CHECKS.length || Object.keys(d.compliance).length !== COMPLIANCE.length) {
    throw Error("Unexpected or unsafe delivery readiness evidence.");
  }
  const counts = d.audience_status_counts;
  if (counts.source !== "owner_list_status_snapshot" || counts.consent_verified !== false || counts.suppression_verified !== false || Object.keys(counts).length !== 10 || !Number.isSafeInteger(counts.total) || counts.total < 0) {
    throw Error("Untrusted audience status evidence.");
  }
  let sum = 0;
  for (const key of STATUS_KEYS) {
    const n = counts[key];
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) {
      throw Error("Invalid aggregate audience count.");
    }
    sum += n;
    if (!Number.isSafeInteger(sum)) throw Error("Audience total exceeds safe integer.");
  }
  if (sum !== counts.total) throw Error("Audience count total mismatch.");
  const overlaps = d.blacklist_overlap;
  if (overlaps.source !== "acelle_owner_list_blacklist_overlap_v1" || overlaps.global_blacklist_policy !== "unverified" || overlaps.suppression_verified !== false || overlaps.recipient_send_authorized !== false || Object.keys(overlaps).length !== 9) {
    throw Error("Unsafe blacklist overlap attestation.");
  }
  const overlapFields = [
    "subscribed_total",
    "owner_blacklist_overlap",
    "global_blacklist_overlap",
    "either_blacklist_overlap",
    "without_either_blacklist_overlap"
  ];
  for (const key of overlapFields) {
    const n = overlaps[key];
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) {
      throw Error("Invalid blacklist overlap aggregate.");
    }
  }
  const total = counts.subscribed;
  const owner = overlaps.owner_blacklist_overlap;
  const global = overlaps.global_blacklist_overlap;
  const either = overlaps.either_blacklist_overlap;
  const clear = overlaps.without_either_blacklist_overlap;
  if (overlaps.subscribed_total !== total || owner > total || global > total || either > total || either < Math.max(owner, global) || either + clear !== total) {
    throw Error("Blacklist overlap contradicts subscriber status totals.");
  }
  const budget = d.budget_snapshot;
  const states = [
    "no_active_subscription",
    "not_granted_in_snapshot",
    "unlimited_in_snapshot",
    "limited_in_snapshot"
  ];
  const units = ["second", "minute", "hour", "day", "week", "month"];
  if (budget.source !== "acelle_cold_credit_plan_rate_snapshot_v1" || !states.includes(String(budget.credit_state)) || budget.live_credit_balance_verified !== false || budget.live_rate_window_verified !== false || budget.quota_verified !== false || budget.send_authorized !== false || Object.keys(budget).length !== 11 || typeof budget.rate_limit_configured !== "boolean") {
    throw Error("Unsafe Acelle quota snapshot attestation.");
  }
  if (budget.credit_state === "limited_in_snapshot") {
    if (typeof budget.credits_remaining_snapshot !== "number" || !Number.isSafeInteger(budget.credits_remaining_snapshot) || budget.credits_remaining_snapshot < 0) {
      throw Error("Invalid finite credit snapshot.");
    }
  } else if (budget.credits_remaining_snapshot !== null) {
    throw Error("Nonfinite credit snapshot cannot report finite remaining.");
  }
  if (budget.credit_state === "no_active_subscription" && budget.rate_limit_configured) {
    throw Error("No subscription cannot have active plan rate limit.");
  }
  if (budget.rate_limit_configured) {
    if (typeof budget.rate_limit_per_window !== "number" || !Number.isSafeInteger(budget.rate_limit_per_window) || budget.rate_limit_per_window < 0 || typeof budget.rate_window_amount !== "number" || !Number.isSafeInteger(budget.rate_window_amount) || budget.rate_window_amount < 1 || !units.includes(String(budget.rate_window_unit))) {
      throw Error("Invalid rate-limit plan configuration.");
    }
  } else if (budget.rate_limit_per_window !== null || budget.rate_window_amount !== null || budget.rate_window_unit !== null) {
    throw Error("Unconfigured rate limiter must have null configuration.");
  }
  const provenance = d.consent_provenance;
  const provenanceFields = [
    "double_optin_label",
    "single_optin_label",
    "imported_label",
    "admin_added_label",
    "other_or_missing_label"
  ];
  if (provenance.source !== "acelle_subscriber_type_metadata_v1" || provenance.double_optin_receipt_verified !== false || provenance.marketing_purpose_consent_verified !== false || provenance.consent_audit_complete !== false || provenance.send_authorized !== false || Object.keys(provenance).length !== 12 || typeof provenance.subscribed_total !== "number" || !Number.isSafeInteger(provenance.subscribed_total) || provenance.subscribed_total < 0 || typeof provenance.ip_metadata_present !== "number" || !Number.isSafeInteger(provenance.ip_metadata_present) || provenance.ip_metadata_present < 0 || provenance.ip_metadata_present > provenance.subscribed_total || provenance.subscribed_total !== counts.subscribed) {
    throw Error("Untrusted consent provenance labels.");
  }
  let labeledTotal = 0;
  for (const key of provenanceFields) {
    const n = provenance[key];
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0)
      throw Error("Invalid consent provenance count.");
    labeledTotal += n;
    if (!Number.isSafeInteger(labeledTotal))
      throw Error("Consent provenance count overflow.");
  }
  if (labeledTotal !== provenance.subscribed_total)
    throw Error("Consent provenance totals do not match subscriber status.");
  const receipt2 = d.consent_token_receipts;
  if (receipt2.source !== "token_redemption_candidate_v1" || !["disabled", "candidate_only"].includes(String(receipt2.state)) || Object.keys(receipt2).length !== 8 || receipt2.mailbox_delivery_verified !== false || receipt2.marketing_consent_verified !== false || receipt2.unsubscribe_hooks_verified !== false || receipt2.send_authorized !== false) {
    throw Error("Untrusted candidate consent receipt state.");
  }
  const redeemed = receipt2.current_subscribed_redeemed_tokens;
  const withdrawn = receipt2.current_subscribed_withdrawn;
  if (receipt2.state === "disabled") {
    if (redeemed !== null || withdrawn !== null)
      throw Error("Disabled consent ledger must have unknown, not zero, counts.");
  } else {
    if (typeof redeemed !== "number" || !Number.isSafeInteger(redeemed) || redeemed < 0 || typeof withdrawn !== "number" || !Number.isSafeInteger(withdrawn) || withdrawn < 0 || redeemed + withdrawn > total) {
      throw Error("Invalid candidate consent receipt totals.");
    }
  }
  for (const key of CHECKS) if (typeof d.checks[key] !== "boolean")
    throw Error("Missing server-side readiness check.");
  for (const key of COMPLIANCE) if (d.compliance[key] !== "unverified")
    throw Error("Client refuses unsupported compliance attestation.");
  return d;
}
async function explicitlyReadDeliveryReadiness(requester, origin, siteUid, draftUid, requestUid, expectedAcelleUid, token) {
  const req = buildReadinessRequest(origin, siteUid, draftUid, requestUid, token);
  const response = await requester(req);
  if (!response || response.status !== 200)
    throw Error("Readiness GET not available. No delivery was attempted.");
  return parseDeliveryReadiness(response.json, siteUid, draftUid, requestUid, expectedAcelleUid);
}

// src/email/native-schedule-diagnostic.ts
var UUID15 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var ACELLE2 = /^[a-f0-9]{13}$/;
var HTTPS = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i;
function buildNativeScheduleDiagnosticRequest(origin, siteUid, campaignUid, token) {
  const base2 = origin.replace(/\/+$/, "");
  if (!HTTPS.test(base2)) throw Error("Only a configured HTTPS HakiSend origin is allowed.");
  if (!UUID15.test(siteUid)) throw Error("Invalid pinned Site UID.");
  if (!ACELLE2.test(campaignUid)) throw Error("Invalid native Acelle Campaign UID.");
  if (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token))
    throw Error("Secure OAuth Email connection required.");
  return {
    url: base2 + "/api/v1/hakisend/sites/" + siteUid.toLowerCase() + "/emails/campaigns/" + campaignUid + "/schedule/diagnostic",
    method: "GET",
    headers: { Accept: "application/json", Authorization: "Bearer " + token },
    throw: false
  };
}
var STATUS = /* @__PURE__ */ new Set([
  "native_unscheduled_draft",
  "intent_only_unhanded",
  "intent_cancelled_only",
  "handoff_unknown",
  "native_state_inconsistent",
  "native_schedule_unattested",
  "native_state_unattested"
]);
function parseNativeScheduleDiagnostic(raw, siteUid, campaignUid) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Invalid HakiSend diagnostic response.");
  const env = raw;
  if (env.success !== true || !env.data || typeof env.data !== "object" || Array.isArray(env.data)) throw Error("HakiSend diagnostic was not verified.");
  const d = env.data;
  if (d.source !== "acelle_native_schedule_diagnostic_v1" || d.site_uid !== siteUid.toLowerCase() || d.campaign_uid !== campaignUid || typeof d.status !== "string" || !STATUS.has(d.status) || d.read_only !== true || d.send_authorized !== false || d.dispatch_authorized !== false || d.provider_receipt_verified !== false || d.provider_schedule_confirmed !== false || d.native_schedule_confirmed !== false || d.calendar_scheduled_at_utc !== null || typeof d.native_schedule_present !== "boolean" || typeof d.native_state_inconsistent !== "boolean" || typeof d.has_ledger_intent !== "boolean" || !(d.ledger_revision === null || typeof d.ledger_revision === "number" && Number.isSafeInteger(d.ledger_revision) && d.ledger_revision > 0) || !(d.ledger_status === null || typeof d.ledger_status === "string")) throw Error("Unsafe or unverified native schedule response.");
  const message = d.status === "intent_only_unhanded" ? "Requested time exists in the internal ledger, not in native Acelle." : d.status === "intent_cancelled_only" ? "Internal intent was cancelled; no provider or native cancellation proven." : d.status === "native_schedule_unattested" ? "Acelle has native schedule markers; worker/provider confirmation is not verified." : d.status === "native_unscheduled_draft" ? "Acelle is a draft without a verified send time." : "Native schedule state needs operator reconciliation. No sending is authorized.";
  return {
    siteUid: siteUid.toLowerCase(),
    campaignUid,
    status: d.status,
    ledgerRevision: d.ledger_revision,
    ledgerStatus: d.ledger_status,
    nativeMarkerPresent: d.native_schedule_present,
    nativeStateInconsistent: d.native_state_inconsistent,
    message
  };
}

// src/email/native-delivery-evidence.ts
var UUID16 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var CAMPAIGN3 = /^[a-f0-9]{13}$/;
var HTTPS2 = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i;
function buildNativeDeliveryEvidenceGet(origin, siteUid, campaignUid, token) {
  const base2 = origin.replace(/\/+$/, "");
  if (!HTTPS2.test(base2)) throw Error("HakiSend API requires an HTTPS origin.");
  if (!UUID16.test(siteUid)) throw Error("Invalid owned Site UID.");
  if (!CAMPAIGN3.test(campaignUid)) throw Error("Invalid Acelle Campaign UID.");
  if (typeof token !== "string" || !token.trim() || /[\r\n]/.test(token))
    throw Error("Secure OAuth Email read access is required.");
  return {
    url: base2 + "/api/v1/hakisend/sites/" + siteUid.toLowerCase() + "/emails/campaigns/" + campaignUid + "/delivery/evidence",
    method: "GET",
    headers: { Accept: "application/json", Authorization: "Bearer " + token },
    throw: false
  };
}
function parseNativeDeliveryEvidence(response, siteUid, campaignUid) {
  if (!response || typeof response !== "object" || Array.isArray(response))
    throw Error("Invalid native delivery evidence response.");
  const wrapper = response;
  if (wrapper.success !== true || !wrapper.data || typeof wrapper.data !== "object" || Array.isArray(wrapper.data))
    throw Error("Native evidence could not be read.");
  const d = wrapper.data;
  if (d.contract_version !== "hks_acelle_native_message_evidence_v1" || d.site_uid !== siteUid.toLowerCase() || d.campaign_uid !== campaignUid || d.evidence_kind !== "acelle_local_tracking_counts_only" || d.read_only !== true || d.send_authorized !== false || d.dispatch_authorized !== false || d.provider_handoff_receipt_verified !== false || d.mailbox_delivery_verified !== false || d.campaign_delivery_complete_verified !== false || d.calendar_delivery_confirmed_at_utc !== null || typeof d.unexpected_native_activity !== "boolean" || typeof d.campaign_native_status !== "string" || ![
    "new",
    "scheduled",
    "queued",
    "sending",
    "done",
    "awaiting_winner",
    "sending_winner"
  ].includes(d.campaign_native_status) || typeof d.ledger_status !== "string" || ![
    "reserved",
    "handoff_started",
    "provider_accepted",
    "ambiguous",
    "cancelled"
  ].includes(d.ledger_status) || !Number.isSafeInteger(d.ledger_revision) || d.ledger_revision < 1) throw Error("Missing native evidence safety boundary.");
  const fields = [
    "acelle_recorded_sent",
    "acelle_recorded_failed",
    "acelle_recorded_duplicate",
    "acelle_tracked_total",
    "tracked_with_bounce",
    "tracked_with_complaint"
  ];
  for (const field of fields) {
    if (typeof d[field] !== "number" || !Number.isSafeInteger(d[field]) || d[field] < 0) throw Error("Invalid native evidence counts.");
  }
  const total = d.acelle_recorded_sent + d.acelle_recorded_failed + d.acelle_recorded_duplicate;
  if (total !== d.acelle_tracked_total || d.tracked_with_bounce > total || d.tracked_with_complaint > total)
    throw Error("Inconsistent native evidence counts.");
  if (["reserved", "cancelled"].includes(d.ledger_status) && total > 0 && d.unexpected_native_activity !== true)
    throw Error("Native messages exist without a verified handoff.");
  if (!["reserved", "cancelled"].includes(d.ledger_status) && d.unexpected_native_activity === true)
    throw Error("Invalid native handoff conflict evidence.");
  return {
    siteUid: siteUid.toLowerCase(),
    campaignUid,
    campaignNativeStatus: d.campaign_native_status,
    ledgerStatus: d.ledger_status,
    ledgerRevision: d.ledger_revision,
    acelleRecordedSent: d.acelle_recorded_sent,
    acelleRecordedFailed: d.acelle_recorded_failed,
    acelleRecordedDuplicate: d.acelle_recorded_duplicate,
    trackedWithBounce: d.tracked_with_bounce,
    trackedWithComplaint: d.tracked_with_complaint,
    unexpectedNativeActivity: d.unexpected_native_activity,
    disclosure: "Acelle recorded sending activity; inbox delivery and provider acceptance are NOT verified."
  };
}

// src/calendar/calendar-projection.ts
var validTime = (n) => n === null || Number.isSafeInteger(n) && n >= 0;
function projectCalendar(items) {
  const posts = /* @__PURE__ */ new Map();
  for (const item of items) {
    if (item.kind === "post" && item.serverConfirmed) posts.set(item.siteUid + ":" + item.uid, item);
  }
  return items.map((item) => {
    if (!validTime(item.scheduledAtUtcMs)) return { ...item, effectiveAtUtcMs: null, blockedReason: "INVALID_TIME" };
    if (!item.serverConfirmed) return { ...item, effectiveAtUtcMs: null, blockedReason: "UNCONFIRMED_LOCAL_STATE" };
    if (item.kind !== "post_linked_email") return { ...item, effectiveAtUtcMs: item.scheduledAtUtcMs };
    if (item.status === "draft" || item.status === "cancelled" || item.status === "failed" || item.status === "ambiguous") {
      return { ...item, effectiveAtUtcMs: null, blockedReason: "LINKED_EMAIL_NOT_ENROLLED" };
    }
    if (!item.linkedPostUid) return { ...item, effectiveAtUtcMs: null, blockedReason: "MISSING_LINKED_POST" };
    const post = posts.get(item.siteUid + ":" + item.linkedPostUid);
    if (!post) return { ...item, effectiveAtUtcMs: null, blockedReason: "LINKED_POST_NOT_CONFIRMED" };
    if (post.status === "cancelled" || post.status === "failed") return { ...item, effectiveAtUtcMs: null, blockedReason: "LINKED_POST_INACTIVE" };
    if (!validTime(post.scheduledAtUtcMs)) return { ...item, effectiveAtUtcMs: null, blockedReason: "INVALID_LINKED_POST_TIME" };
    return { ...item, effectiveAtUtcMs: post.scheduledAtUtcMs };
  });
}

// src/calendar/unified-calendar.ts
var uid2 = (e) => [e.kind, e.siteUid, e.uid].join(":");
var allowedStatus = /* @__PURE__ */ new Set(["draft", "planned", "scheduled", "published", "sent", "failed", "cancelled", "ambiguous"]);
function localDay(ms, tz) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = f.formatToParts(new Date(ms));
  const get = (kind) => {
    var _a;
    return (_a = parts.find((p) => p.type === kind)) == null ? void 0 : _a.value;
  };
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function buildUnifiedCalendar(items, timezone) {
  var _a;
  if (!timezone || timezone.length > 128) throw Error("Missing or oversized timezone.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch (e) {
    throw Error("Invalid IANA timezone.");
  }
  const ids = /* @__PURE__ */ new Set();
  for (const item of items) {
    if (!item.siteUid || !item.uid || !allowedStatus.has(item.status))
      throw Error("Invalid calendar identity or status.");
    const id2 = uid2(item);
    if (ids.has(id2)) throw Error("Duplicate calendar event identity.");
    ids.add(id2);
  }
  const projected = projectCalendar(items);
  const grouped = /* @__PURE__ */ new Map();
  const unscheduled = [];
  const blocked = [];
  for (const event of projected) {
    if (event.blockedReason || !event.serverConfirmed) {
      blocked.push(event);
      continue;
    }
    if (event.effectiveAtUtcMs === null) {
      unscheduled.push(event);
      continue;
    }
    const date = localDay(event.effectiveAtUtcMs, timezone);
    const day = (_a = grouped.get(date)) != null ? _a : [];
    day.push(event);
    grouped.set(date, day);
  }
  const days = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => {
    var _a2;
    entries.sort((a, b) => {
      var _a3, _b;
      return ((_a3 = a.effectiveAtUtcMs) != null ? _a3 : 0) - ((_b = b.effectiveAtUtcMs) != null ? _b : 0) || uid2(a).localeCompare(uid2(b));
    });
    const seen = /* @__PURE__ */ new Map();
    for (const event of entries) {
      if (event.status === "cancelled" || event.status === "failed") continue;
      const time2 = String(event.effectiveAtUtcMs);
      seen.set(time2, ((_a2 = seen.get(time2)) != null ? _a2 : 0) + 1);
    }
    return {
      localDate: date,
      entries,
      overlappingServerTimes: [...seen].filter(([, n]) => n > 1).map(([k]) => k)
    };
  });
  return {
    timezone,
    days,
    unscheduled,
    blocked,
    serverConfirmedCount: items.filter((x) => x.serverConfirmed).length,
    tentativeCount: items.filter((x) => !x.serverConfirmed).length
  };
}

// src/calendar/server-calendar-contract.ts
var VALID_KINDS = /* @__PURE__ */ new Set([
  "post",
  "post_linked_email",
  "standalone_email"
]);
var STATUSES_BY_KIND = {
  // This v1 server only proves authoring status, never public visibility.
  post: /* @__PURE__ */ new Set(["draft", "scheduled", "published", "ambiguous"]),
  // No native scheduling or provider receipts are verified yet.
  post_linked_email: /* @__PURE__ */ new Set(["draft", "ambiguous"]),
  standalone_email: /* @__PURE__ */ new Set(["draft", "ambiguous", "cancelled"])
};
var PAYLOAD_KEYS = /* @__PURE__ */ new Set(["success", "data"]);
var SNAPSHOT_KEYS = /* @__PURE__ */ new Set([
  "contract_version",
  "site_uid",
  "as_of_utc_ms",
  "truncated",
  "read_only",
  "events"
]);
var ALLOWED_FIELDS = /* @__PURE__ */ new Set([
  "uid",
  "kind",
  "siteUid",
  "title",
  "status",
  "serverConfirmed",
  "scheduledAtUtcMs",
  "linkedPostUid",
  "sendAuthorized",
  "postPublishAtUtcMs",
  "postUnpublishAtUtcMs",
  "publicVisibility",
  "scheduleAuthorization"
]);
var UID2 = /^[a-z0-9][a-z0-9_.:-]{0,127}$/i;
var UUID17 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var object3 = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
var time = (x) => x === null || typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
function validateHakiSendCalendar(payload, expectedSiteUid, timezone) {
  if (!UUID17.test(expectedSiteUid)) throw Error("Invalid expected Site identity.");
  if (!object3(payload) || payload.success !== true || !object3(payload.data)) {
    throw Error("Calendar API did not return a valid success envelope.");
  }
  if (Object.keys(payload).some((key) => !PAYLOAD_KEYS.has(key))) {
    throw Error("Unexpected Calendar response envelope field.");
  }
  const d = payload.data;
  if (Object.keys(d).some((key) => !SNAPSHOT_KEYS.has(key))) {
    throw Error("Unexpected Calendar snapshot field.");
  }
  if (d.contract_version !== "hks_calendar_v1") {
    throw Error("Calendar API contract version differs from the client.");
  }
  if (d.site_uid !== expectedSiteUid || d.read_only !== true || !time(d.as_of_utc_ms) || d.as_of_utc_ms === null || typeof d.truncated !== "boolean" || !Array.isArray(d.events) || d.events.length > 300) {
    throw Error("Calendar API response is not a verified owner-scoped read.");
  }
  const events = d.events.map((raw) => {
    if (!object3(raw) || Object.keys(raw).some((key) => !ALLOWED_FIELDS.has(key))) {
      throw Error("Unexpected calendar content field.");
    }
    if (typeof raw.uid !== "string" || !UID2.test(raw.uid) || raw.siteUid !== expectedSiteUid || !VALID_KINDS.has(raw.kind) || !STATUSES_BY_KIND[raw.kind].has(raw.status) || raw.serverConfirmed !== true || raw.sendAuthorized !== false || !time(raw.scheduledAtUtcMs)) {
      throw Error("Calendar event identity, time or authorization is invalid.");
    }
    if (typeof raw.title !== "string" || raw.title.length > 512 || /[\0\r]/.test(raw.title)) {
      throw Error("Calendar event title is invalid.");
    }
    if (raw.kind === "post") {
      if (raw.publicVisibility !== "not_attested" || "linkedPostUid" in raw || "scheduleAuthorization" in raw || !time(raw.postPublishAtUtcMs) || !time(raw.postUnpublishAtUtcMs) || (raw.status === "scheduled" ? raw.scheduledAtUtcMs === null || raw.scheduledAtUtcMs !== raw.postPublishAtUtcMs : raw.scheduledAtUtcMs !== null)) {
        throw Error("Post authoring date must not claim public visibility or an unverified clock.");
      }
    }
    if (raw.kind === "post_linked_email") {
      if (typeof raw.linkedPostUid !== "string" || !UID2.test(raw.linkedPostUid)) {
        throw Error("Missing authorized Post linkage.");
      }
      if (raw.scheduleAuthorization !== "not_attested" || raw.scheduledAtUtcMs !== null || "postPublishAtUtcMs" in raw || "postUnpublishAtUtcMs" in raw || "publicVisibility" in raw) {
        throw Error("Post-linked Email draft cannot have its own schedule.");
      }
    }
    if (raw.kind === "standalone_email" && (raw.scheduledAtUtcMs !== null || "linkedPostUid" in raw || "scheduleAuthorization" in raw || "postPublishAtUtcMs" in raw || "postUnpublishAtUtcMs" in raw || "publicVisibility" in raw)) {
      throw Error("Standalone Draft cannot masquerade as scheduled mail.");
    }
    return {
      uid: raw.uid,
      kind: raw.kind,
      siteUid: expectedSiteUid,
      status: raw.status,
      serverConfirmed: true,
      scheduledAtUtcMs: raw.scheduledAtUtcMs,
      ...raw.kind === "post_linked_email" ? { linkedPostUid: raw.linkedPostUid } : {},
      title: raw.title,
      sendAuthorized: false,
      ...raw.kind === "post" ? { publicVisibility: "not_attested" } : {}
    };
  });
  return {
    contractVersion: "hks_calendar_v1",
    siteUid: expectedSiteUid,
    asOfUtcMs: d.as_of_utc_ms,
    truncated: d.truncated,
    calendar: buildUnifiedCalendar(events, timezone)
  };
}
function buildCalendarReadRequest(origin, siteUid, bearer, limit = 50) {
  if (!UUID17.test(siteUid)) throw Error("Invalid Site identity.");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw Error("Invalid bounded Calendar page size.");
  }
  if (typeof bearer !== "string" || bearer.length < 8 || bearer.length > 8192 || /[\0\r\n]/.test(bearer)) {
    throw Error("Missing or unsafe bearer token.");
  }
  const url2 = new URL(origin);
  if (url2.protocol !== "https:" || url2.username || url2.password || url2.search || url2.hash || url2.pathname !== "/") {
    throw Error("Calendar API origin must be a plain HTTPS origin.");
  }
  const path = "/api/v1/hakisend/sites/" + encodeURIComponent(siteUid) + "/calendar";
  return {
    method: "GET",
    url: url2.origin + path + "?limit=" + limit,
    headers: { Authorization: "Bearer " + bearer, Accept: "application/json" }
  };
}

// src/email/email-connect-scope.ts
var PUBLISHING_SCOPES = Object.freeze([
  "sites:read",
  "content:read",
  "content:write",
  "publications:write",
  "media:write"
]);
var EMAIL_DRAFT_SCOPES = Object.freeze([
  "email:read",
  "email:compose"
]);
var DELIVERY_SCOPES = Object.freeze(["email:send", "email:schedule"]);
function verifyConnectScopes(raw, emailRequested, deliveryRequested = false) {
  if (!Array.isArray(raw))
    return { ok: false, reason: "Missing scope evidence in HakiSend exchange response." };
  if (raw.length > 16 || !raw.every((v) => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= 80)) {
    return { ok: false, reason: "Invalid scope evidence." };
  }
  if (new Set(raw).size !== raw.length)
    return { ok: false, reason: "Duplicate scopes in exchange response." };
  if (deliveryRequested && !emailRequested) return { ok: false, reason: "Delivery requires Email Draft grant." };
  const expected = [
    ...PUBLISHING_SCOPES,
    ...emailRequested ? EMAIL_DRAFT_SCOPES : [],
    ...deliveryRequested ? DELIVERY_SCOPES : []
  ].sort();
  const actual = [...raw].sort();
  if (actual.length !== expected.length || actual.some((s, i) => s !== expected[i])) {
    return { ok: false, reason: emailRequested ? "Email draft access was not granted. The previous HakiSend connection was preserved." : "Unexpected scopes from HakiSend. The previous connection was preserved." };
  }
  return { ok: true, scopes: expected };
}
function verifyEmailReconnectSitesProbe(status, payload) {
  if (typeof status !== "number" || status < 200 || status >= 300 || !payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const result = payload;
  if (result.success !== true || !result.data) return false;
  const d = result.data;
  const rows = Array.isArray(d) ? d : typeof d === "object" && !Array.isArray(d) && d !== null ? d.sites : null;
  return Array.isArray(rows) && rows.length <= 1e3 && rows.every((row) => row !== null && typeof row === "object" && !Array.isArray(row) && typeof row.uid === "string" && typeof row.name === "string");
}

// src/calendar/paged-calendar-contract.ts
var CURSOR = /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/;
var KEYS = /* @__PURE__ */ new Set([
  "contract_version",
  "site_uid",
  "as_of_utc_ms",
  "truncated",
  "read_only",
  "events",
  "next_cursor"
]);
var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function buildCalendarPageRequest(origin, siteUid, bearer, limit = 50, cursor = null) {
  const base2 = buildCalendarReadRequest(origin, siteUid, bearer, limit);
  if (cursor !== null && (typeof cursor !== "string" || cursor.length > 2048 || !CURSOR.test(cursor))) {
    throw Error("Invalid Calendar continuation cursor.");
  }
  return {
    ...base2,
    url: base2.url.replace("/calendar?limit=", "/calendar/pages?limit=") + (cursor === null ? "" : "&cursor=" + encodeURIComponent(cursor))
  };
}
function acceptCalendarPage(response, expectedSiteUid, timezone, prior = null) {
  var _a, _b;
  if (!isRecord(response) || response.success !== true || !isRecord(response.data) || Object.keys(response).some((k) => k !== "success" && k !== "data")) {
    throw Error("Invalid Calendar v2 response envelope.");
  }
  const d = response.data;
  if (Object.keys(d).some((k) => !KEYS.has(k)) || d.contract_version !== "hks_calendar_v2" || typeof d.truncated !== "boolean" || !Array.isArray(d.events) || d.events.length > 100 || !(d.next_cursor === null || typeof d.next_cursor === "string" && d.next_cursor.length <= 2048 && CURSOR.test(d.next_cursor)) || (d.truncated ? d.next_cursor === null || d.events.length === 0 : d.next_cursor !== null)) {
    throw Error("Unsafe or incomplete Calendar v2 page.");
  }
  if (prior && (prior.siteUid !== expectedSiteUid || prior.nextCursor === null || prior.pages.length >= 500)) {
    throw Error("Calendar continuation was not explicitly available.");
  }
  const validated = validateHakiSendCalendar({
    success: true,
    data: {
      contract_version: "hks_calendar_v1",
      site_uid: d.site_uid,
      as_of_utc_ms: d.as_of_utc_ms,
      truncated: d.truncated,
      read_only: d.read_only,
      events: d.events
    }
  }, expectedSiteUid, timezone);
  if (prior && prior.asOfUtcMs !== validated.asOfUtcMs) {
    throw Error("Calendar snapshot clock changed between pages.");
  }
  if (prior && prior.nextCursor === d.next_cursor) {
    throw Error("Calendar cursor did not advance.");
  }
  const keys = new Set((_a = prior == null ? void 0 : prior.seenIdentities) != null ? _a : []);
  for (const event of d.events) {
    if (!isRecord(event)) throw Error("Invalid Calendar event.");
    const key = String(event.kind) + ":" + String(event.siteUid) + ":" + String(event.uid);
    if (keys.has(key)) throw Error("Duplicate Calendar record between pages.");
    keys.add(key);
  }
  return {
    siteUid: expectedSiteUid,
    asOfUtcMs: validated.asOfUtcMs,
    pages: [...(_b = prior == null ? void 0 : prior.pages) != null ? _b : [], validated],
    seenIdentities: [...keys],
    nextCursor: d.next_cursor
  };
}

// src/main.ts
var HakiSendFolderPicker = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, onChooseFolder) {
    super(app);
    this.onChooseFolder = onChooseFolder;
    this.setPlaceholder("Search Obsidian folders by name or path...");
    this.setInstructions([
      { command: "\u2191\u2193", purpose: "Navigate" },
      { command: "\u21B5", purpose: "Choose folder" },
      { command: "esc", purpose: "Cancel" }
    ]);
  }
  getItems() {
    return this.app.vault.getAllLoadedFiles().filter(
      (item) => item instanceof import_obsidian.TFolder && item.path.length > 0 && item.path !== "/"
    ).sort((left, right) => left.path.localeCompare(right.path));
  }
  getItemText(folder) {
    return folder.path;
  }
  onChooseItem(folder) {
    this.onChooseFolder(folder);
  }
};
async function sha256Hex(data2) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data2
  );
  return Array.from(
    new Uint8Array(digest)
  ).map(
    (value) => value.toString(16).padStart(2, "0")
  ).join("");
}
function mediaMimeType(file) {
  const extension = file.extension.toLowerCase();
  const types = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif"
  };
  const mime = types[extension];
  if (!mime) {
    throw new Error(
      `Unsupported local image type: .${extension}`
    );
  }
  return mime;
}
function externalImageTarget(target) {
  return /^https?:\/\//i.test(target) || /^data:/i.test(target) || /^\/\//.test(target);
}
function safeMarkdownAlt(value) {
  return value.replace(/\]/g, "\\]").replace(/\r?\n/g, " ").trim();
}
function uuidV4() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes).map(
    (value) => value.toString(16).padStart(2, "0")
  );
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join("")
  ].join("-");
}
function stripYamlFrontmatter(markdown) {
  let source = markdown.replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/);
  if (lines.length < 3 || lines[0].trim() !== "---") {
    return source;
  }
  const limit = Math.min(lines.length, 200);
  for (let i = 1; i < limit; i++) {
    const line = lines[i].trim();
    if (line === "---" || line === "...") {
      return lines.slice(i + 1).join("\n").replace(/^\n/, "");
    }
  }
  return source;
}
function stripAuthoringInputBlocks(markdown) {
  const lines = markdown.split("\n");
  const output = [];
  let inFence = false;
  let fenceMarker = "";
  const bracketDelta = (value) => {
    let depth = 0;
    for (const char of value) {
      if (char === "[") {
        depth++;
      } else if (char === "]") {
        depth--;
      }
    }
    return depth;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }
      output.push(line);
      continue;
    }
    if (!inFence && trimmed.startsWith(
      "INPUT["
    )) {
      let depth = bracketDelta(trimmed);
      let closing = i;
      while (depth > 0 && closing + 1 < lines.length) {
        closing++;
        depth += bracketDelta(
          lines[closing]
        );
      }
      if (depth <= 0) {
        i = closing;
        continue;
      }
    }
    output.push(line);
  }
  return output.join("\n");
}
function normalizeTagValues(value) {
  if (Array.isArray(value)) {
    return value.map(
      (item) => String(item).trim()
    ).filter(Boolean).slice(0, 20);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}
function simpleSlug(value) {
  return value.replace(/[đĐ]/g, "d").normalize("NFD").replace(
    /[\u0300-\u036f]/g,
    ""
  ).toLowerCase().replace(
    /[^a-z0-9]+/g,
    "-"
  ).replace(/^-+|-+$/g, "");
}
var DEFAULT_SETTINGS = {
  apiBaseUrl: "https://app.hakisend.com",
  defaultSiteUid: "",
  folderSiteMappings: [],
  folderCategoryMappings: [],
  sitePublicOrigins: {},
  bearerToken: "",
  sites: [],
  cloudSyncAutoEnabled: false,
  uiAdvancedCommands: false,
  cloudSyncBaselines: {}
};
var ACCESS_TOKEN_SECRET = "hakisend-publisher-access-token";
var PENDING_CONNECTION_SECRET = "hakisend-publisher-pkce-pending";
var CONNECT_CALLBACK_ACTION = "hakisend-connect";
var PENDING_MAX_AGE_MS = 30 * 60 * 1e3;
function normalizeFolderPath(value) {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}
function pathIsWithinFolder(path, folder) {
  return path === folder || path.startsWith(folder + "/");
}
function normalizeBaseUrl(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return DEFAULT_SETTINGS.apiBaseUrl;
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    throw Error("HakiSend API URL must be a valid HTTPS origin.");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash ||
      !/^https:\/\/[^/?#@]+$/.test(parsed.origin)) {
    throw Error("HakiSend API URL must use HTTPS, without credentials, path, query or fragment.");
  }
  return parsed.origin;
}
// Preserve an old/partially edited value in Settings so users can correct it.
// All credentialed network paths must call strict normalizeBaseUrl() first.
function storedApiBaseUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return DEFAULT_SETTINGS.apiBaseUrl;
  try {
    return normalizeBaseUrl(raw);
  } catch (e) {
    return raw;
  }
}
function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomBase64Url(byteLength2) {
  const bytes = new Uint8Array(byteLength2);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}
async function sha256Base64Url(value) {
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    input
  );
  return base64Url(
    new Uint8Array(digest)
  );
}
function safeMarkdownBasename(raw) {
  let value = raw.normalize("NFKC").replace(
    /[\\/:*?"<>|]/g,
    "-"
  ).replace(
    /\s+/g,
    " "
  ).trim().replace(
    /[. ]+$/g,
    ""
  );
  if (!value) {
    value = "Untitled";
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) {
    value = "_" + value;
  }
  if (value.length > 120) {
    value = value.slice(0, 120).trim().replace(
      /[. ]+$/g,
      ""
    );
  }
  return value || "Untitled";
}
function yamlQuotedScalar(value) {
  return JSON.stringify(
    value
  );
}
function padDatePart(value) {
  return String(value).padStart(2, "0");
}
function localInputValue(date) {
  return [
    date.getFullYear(),
    "-",
    padDatePart(
      date.getMonth() + 1
    ),
    "-",
    padDatePart(
      date.getDate()
    ),
    "T",
    padDatePart(
      date.getHours()
    ),
    ":",
    padDatePart(
      date.getMinutes()
    )
  ].join("");
}
function isoWithLocalOffset(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(
    offsetMinutes
  );
  const offsetHour = Math.floor(
    absolute / 60
  );
  const offsetMinute = absolute % 60;
  return [
    date.getFullYear(),
    "-",
    padDatePart(
      date.getMonth() + 1
    ),
    "-",
    padDatePart(
      date.getDate()
    ),
    "T",
    padDatePart(
      date.getHours()
    ),
    ":",
    padDatePart(
      date.getMinutes()
    ),
    ":00",
    sign,
    padDatePart(
      offsetHour
    ),
    ":",
    padDatePart(
      offsetMinute
    )
  ].join("");
}
function dateFromScheduleValue(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const date = new Date(
    value.trim()
  );
  return Number.isNaN(
    date.getTime()
  ) ? null : date;
}
var HakiSendPostPropertiesModal = class extends import_obsidian.Modal {
  constructor(app, categories, initial, onSubmit) {
    super(app);
    this.categories = categories;
    this.onSubmit = onSubmit;
    this.titleValue = initial.title;
    this.slugValue = initial.slug;
    this.categoryUid = initial.categoryUid;
    this.tagsValue = initial.tags.join(", ");
    this.excerptValue = initial.excerpt;
    this.initialExternalId = initial.externalId;
    this.initialStatus = initial.status;
  }
  onOpen() {
    const {
      contentEl
    } = this;
    contentEl.empty();
    contentEl.createEl(
      "h2",
      {
        text: "HakiSend Post Properties"
      }
    );
    const stateParts = [];
    if (this.initialStatus) {
      stateParts.push(
        "Status: " + this.initialStatus
      );
    }
    if (this.initialExternalId) {
      stateParts.push(
        "Identity: " + this.initialExternalId
      );
    }
    if (stateParts.length) {
      contentEl.createEl(
        "p",
        {
          text: stateParts.join(
            " \xB7 "
          )
        }
      );
    }
    contentEl.createEl(
      "p",
      {
        text: "Changes are local only until you use Save, Schedule, or Publish."
      }
    );
    new import_obsidian.Setting(
      contentEl
    ).setName("Title").setDesc(
      "Public Post title. It does not rename the Markdown file."
    ).addText(
      (text) => {
        text.setValue(
          this.titleValue
        ).onChange(
          (value) => {
            this.titleValue = value;
          }
        );
      }
    );
    new import_obsidian.Setting(
      contentEl
    ).setName("Slug").setDesc(
      "Optional. Leave blank to keep automatic/server slug behavior."
    ).addText(
      (text) => {
        text.setPlaceholder(
          "my-post-slug"
        ).setValue(
          this.slugValue
        ).onChange(
          (value) => {
            this.slugValue = value;
          }
        );
      }
    );
    new import_obsidian.Setting(
      contentEl
    ).setName("Category").setDesc(
      "Stored explicitly so moving the note does not change category."
    ).addDropdown(
      (dropdown) => {
        for (const category of this.categories) {
          dropdown.addOption(
            category.uid,
            `${category.title} (${category.slug})`
          );
        }
        dropdown.setValue(
          this.categoryUid
        ).onChange(
          (value) => {
            this.categoryUid = value;
          }
        );
      }
    );
    new import_obsidian.Setting(
      contentEl
    ).setName("Tags").setDesc(
      "Comma-separated tags. Blank removes local HakiSend tags."
    ).addText(
      (text) => {
        text.setPlaceholder(
          "parenting, education"
        ).setValue(
          this.tagsValue
        ).onChange(
          (value) => {
            this.tagsValue = value;
          }
        );
      }
    );
    new import_obsidian.Setting(
      contentEl
    ).setName("Excerpt").setDesc(
      "Optional short description."
    ).addTextArea(
      (text) => {
        text.setPlaceholder(
          "Short description"
        ).setValue(
          this.excerptValue
        ).onChange(
          (value) => {
            this.excerptValue = value;
          }
        );
      }
    );
    new import_obsidian.Setting(
      contentEl
    ).addButton(
      (button) => {
        button.setButtonText(
          "Cancel"
        ).onClick(
          () => {
            this.close();
          }
        );
      }
    ).addButton(
      (button) => {
        button.setButtonText(
          "Update Properties"
        ).setCta().onClick(
          async () => {
            await this.submit();
          }
        );
      }
    );
  }
  async submit() {
    const title = this.titleValue.trim();
    if (!title) {
      new import_obsidian.Notice(
        "Title is required."
      );
      return;
    }
    const category = this.categories.find(
      (item) => item.uid === this.categoryUid
    );
    if (!category) {
      new import_obsidian.Notice(
        "Choose a HakiSend Category."
      );
      return;
    }
    const tags = Array.from(
      new Set(
        this.tagsValue.split(",").map(
          (value) => value.trim()
        ).filter(Boolean)
      )
    );
    this.close();
    await this.onSubmit({
      title,
      slug: this.slugValue.trim(),
      category,
      tags,
      excerpt: this.excerptValue.trim()
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var HakiSendNewPostModal = class extends import_obsidian.Modal {
  constructor(app, initialFolder, resolveFolder, onSubmit) {
    super(app);
    this.initialFolder = initialFolder;
    this.resolveFolder = resolveFolder;
    this.onSubmit = onSubmit;
    this.titleValue = "";
    this.excerptValue = "";
    this.categoryUid = "";
    this.destination = null;
    this.loadSequence = 0;
    this.loading = false;
    this.submitting = false;
    this.folderSetting = null;
    this.siteSetting = null;
    this.categorySetting = null;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "New website post" });
    contentEl.createEl("p", {
      text: "Choose a destination folder. HakiSend Site and Category are resolved automatically. Creating a local draft does not publish it."
    });
    this.folderSetting = new import_obsidian.Setting(contentEl).setName("Obsidian folder").setDesc("Select a folder in this vault.");
    this.folderSetting.addButton((button) => button.setButtonText("Choose folder\u2026").onClick(() => {
      new HakiSendFolderPicker(this.app, (folder) => {
        void this.loadFolder(folder.path);
      }).open();
    }));
    this.siteSetting = new import_obsidian.Setting(contentEl).setName("HakiSend Site").setDesc("Choose a folder to resolve the Site.");
    new import_obsidian.Setting(contentEl).setName("Title").setDesc("Used as the filename and initial Post title.").addText((input) => {
      input.setPlaceholder("Post title");
      input.onChange((value) => {
        this.titleValue = value;
      });
      input.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.submit();
        }
      });
      window.setTimeout(() => input.inputEl.focus(), 0);
    });
    this.categorySetting = new import_obsidian.Setting(contentEl).setName("Category").setDesc("Choose a folder to load this Site's Categories.");
    new import_obsidian.Setting(contentEl).setName("Excerpt").setDesc("Optional short description for the website post.").addTextArea((input) => {
      input.setPlaceholder("Short description");
      input.onChange((value) => {
        this.excerptValue = value;
      });
    });
    new import_obsidian.Setting(contentEl).addButton((button) => button.setButtonText("Cancel").onClick(() => this.close())).addButton((button) => button.setButtonText("Create draft").setCta().onClick(() => {
      void this.submit();
    }));
    const initial = normalizeFolderPath(this.initialFolder);
    if (initial) {
      void this.loadFolder(initial);
    } else {
      this.folderSetting.setDesc("No folder selected. Use Choose folder to continue.");
    }
  }
  async loadFolder(path) {
    var _a, _b, _c, _d, _e, _f;
    const seq = ++this.loadSequence;
    const normalized = normalizeFolderPath(path);
    this.loading = true;
    this.destination = null;
    this.categoryUid = "";
    (_a = this.folderSetting) == null ? void 0 : _a.setDesc(normalized || "No folder selected");
    (_b = this.siteSetting) == null ? void 0 : _b.setDesc("Resolving Site...");
    if (this.categorySetting) {
      this.categorySetting.controlEl.empty();
      this.categorySetting.setDesc("Loading Categories for this folder...");
    }
    try {
      const resolved = await this.resolveFolder(normalized);
      if (seq !== this.loadSequence) return;
      this.destination = resolved;
      this.categoryUid = resolved.preferredCategoryUid;
      (_c = this.siteSetting) == null ? void 0 : _c.setDesc(resolved.siteName);
      (_d = this.folderSetting) == null ? void 0 : _d.setDesc(resolved.folderPath);
      if (this.categorySetting) {
        this.categorySetting.setDesc(
          this.categoryUid ? "Detected from the nearest folder mapping. You can choose a different Category." : "Choose the Category for the selected Site."
        );
        this.categorySetting.addDropdown((dropdown) => {
          dropdown.addOption("", "Choose a Category");
          for (const item of resolved.categories) {
            dropdown.addOption(item.uid, `${item.title} (${item.slug})`);
          }
          dropdown.setValue(this.categoryUid);
          dropdown.onChange((value) => {
            this.categoryUid = value;
          });
        });
      }
    } catch (error) {
      if (seq !== this.loadSequence) return;
      const message = error instanceof Error ? error.message : String(error);
      (_e = this.siteSetting) == null ? void 0 : _e.setDesc("Cannot resolve Site: " + message);
      (_f = this.categorySetting) == null ? void 0 : _f.setDesc("Choose a valid folder to continue.");
    } finally {
      if (seq === this.loadSequence) this.loading = false;
    }
  }
  async submit() {
    if (this.submitting) return;
    if (this.loading) {
      new import_obsidian.Notice("Wait for the Site and Category to finish loading.");
      return;
    }
    const title = this.titleValue.trim();
    if (!title) {
      new import_obsidian.Notice("Enter a title for the new HakiSend Post.");
      return;
    }
    const selected = this.destination;
    if (!selected) {
      new import_obsidian.Notice("Choose a valid Obsidian folder with an accessible HakiSend Site.");
      return;
    }
    const category = selected.categories.find((item) => item.uid === this.categoryUid);
    if (!category) {
      new import_obsidian.Notice("Choose a Category from the selected HakiSend Site.");
      return;
    }
    this.submitting = true;
    try {
      await this.onSubmit({
        title,
        excerpt: this.excerptValue.trim(),
        category,
        siteUid: selected.siteUid,
        folderPath: selected.folderPath
      });
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new import_obsidian.Notice("New website post failed: " + message);
    } finally {
      this.submitting = false;
    }
  }
  onClose() {
    this.loadSequence++;
    this.contentEl.empty();
  }
};
// Read-only Post Calendar v1. Site-authored schedule, not public delivery evidence.
function hksCalendarDay(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
    "-" + String(date.getDate()).padStart(2, "0");
}
function hksCalendarRange(month) {
  if (!(month instanceof Date) || !Number.isFinite(month.getTime())) throw Error("Invalid Calendar month.");
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const start = new Date(first.getFullYear(), first.getMonth(),
    1 - (first.getDay() + 6) % 7, 12);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41, 12);
  const utcDay = (d, offset) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + offset))
    .toISOString().slice(0, 10);
  return { start, from: utcDay(start, -1), to: utcDay(end, 1) };
}
function validatePostCalendar(payload, siteUid, from, to) {
  if (!payload || payload.success !== true || !payload.data || typeof payload.data !== "object")
    throw Error("HakiSend Calendar returned an invalid response.");
  const d = payload.data;
  const time = (v) => typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
    Number.isFinite(Date.parse(v));
  if (d.contract_version !== "hks_post_calendar_v1" || d.source !== "site_post_authoring_schedule" ||
    d.site_uid !== siteUid || d.from !== from || d.to !== to || d.read_only !== true ||
    !Number.isSafeInteger(d.future_count) || d.future_count < 0 ||
    typeof d.truncated !== "boolean" || !Array.isArray(d.events) ||
    d.events.length > 500 || (d.last_future_scheduled_at_utc !== null &&
    !time(d.last_future_scheduled_at_utc))) throw Error("Calendar Site/date contract mismatch.");
  const seen = new Set();
  const events = d.events.map((e) => {
    if (!e || typeof e !== "object" || !/^[0-9a-f-]{36}$/i.test(e.uid) ||
      e.site_uid !== siteUid || typeof e.title !== "string" || !e.title.trim() ||
      e.title.length > 500 || !time(e.publish_at_utc) ||
      !["planned", "time_reached"].includes(e.state) || seen.has(e.uid))
      throw Error("Unsafe or duplicate Calendar event.");
    seen.add(e.uid);
    const externalId = e.external_id == null ? "" : e.external_id;
    if (externalId && !validUuid(externalId)) throw Error("Invalid Calendar Post external ID.");
    return { uid: e.uid, siteUid, title: e.title, when: new Date(e.publish_at_utc),
      state: e.state, externalId,
      categorySlug: typeof e.category_slug === "string" ? e.category_slug : "" };
  });
  return { events, futureCount: d.future_count,
    lastFuture: d.last_future_scheduled_at_utc ? new Date(d.last_future_scheduled_at_utc) : null,
    truncated: d.truncated };
}
var HakiSendPostCalendarPanel = class {
  constructor(root, sites, loadSite, options = {}) {
    this.root = root;
    this.sites = sites;
    this.loadSite = loadSite;
    this.focusedSiteUid = options.focusedSiteUid || "";
    this.onSelectDate = options.onSelectDate || null;
    this.onOpenEvent = options.onOpenEvent || null;
    this.disablePastDates = options.disablePastDates === true;
    const today = options.initialDate instanceof Date && Number.isFinite(options.initialDate.getTime())
      ? options.initialDate : new Date();
    this.month = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    this.selectedDay = hksCalendarDay(today);
    this.filter = "all";
    this.results = [];
    this.errors = [];
    this.loading = false;
    this.sequence = 0;
    this.render();
    void this.load();
  }
  dispose() { this.sequence++; }
  async load() {
    const seq = ++this.sequence;
    const range = hksCalendarRange(this.month);
    const sites = this.filter === "all" ? this.sites : this.sites.filter((s) => s.uid === this.filter);
    const results = [], errors = [];
    this.loading = true;
    this.render();
    // Three concurrent GETs maximum even when a Vault connects 100 Sites.
    for (let i = 0; i < sites.length; i += 3) {
      const batch = await Promise.all(sites.slice(i, i + 3).map(async (site) => {
        try { return { site, snapshot: await this.loadSite(site.uid, range.from, range.to) }; }
        catch (error) { return { site, error: String(error).slice(0, 180) }; }
      }));
      if (seq !== this.sequence) return;
      for (const item of batch) (item.error ? errors : results).push(item);
    }
    if (seq !== this.sequence) return;
    this.results = results;
    this.errors = errors;
    this.loading = false;
    this.render();
  }
  render() {
    const root = this.root;
    root.empty();
    root.addClass("hks-post-calendar");
    root.createEl("h3", { text: "Lịch xuất bản Website" });
    root.createEl("p", { cls: "setting-item-description", text:
      "Lịch Post từ HakiSend Sites. Lịch Email có mục riêng (chỉ đọc) cho đến khi đồng bộ lịch được nghiệm thu." });
    const controls = root.createDiv({ cls: "hks-post-calendar-controls" });
    new import_obsidian.Setting(controls).setName("Xem lịch của").addDropdown((d) => {
      d.addOption("all", "Tất cả Site");
      for (const site of this.sites) d.addOption(site.uid, site.name);
      d.setValue(this.filter).onChange((value) => { this.filter = value; void this.load(); });
    }).addButton((b) => b.setButtonText("◀").setTooltip("Tháng trước").onClick(() => {
      this.month = new Date(this.month.getFullYear(), this.month.getMonth() - 1, 1, 12);
      this.selectedDay = hksCalendarDay(this.month);
      void this.load();
    })).addButton((b) => b.setButtonText("Hôm nay").onClick(() => {
      const now = new Date();
      this.month = new Date(now.getFullYear(), now.getMonth(), 1, 12);
      this.selectedDay = hksCalendarDay(now);
      void this.load();
    })).addButton((b) => b.setButtonText("▶").setTooltip("Tháng sau").onClick(() => {
      this.month = new Date(this.month.getFullYear(), this.month.getMonth() + 1, 1, 12);
      this.selectedDay = hksCalendarDay(this.month);
      void this.load();
    })).addButton((b) => b.setButtonText("Làm mới").onClick(() => void this.load()));
    root.createEl("h4", { text: "Tháng " + String(this.month.getMonth() + 1).padStart(2, "0") +
      "/" + this.month.getFullYear(), cls: "hks-post-calendar-month" });
    if (this.loading) {
      root.createEl("p", { cls: "hks-post-calendar-notice", text: "Đang tải lịch từ HakiSend…" });
      return;
    }
    if (!this.sites.length) root.createEl("p", { cls: "hks-post-calendar-warning",
      text: "Chưa có Site. Vào Settings → HakiSend Publisher → Test connection." });
    if (this.errors.length) {
      root.createEl("p", { cls: "hks-post-calendar-warning", text:
        "Lịch chưa đầy đủ: " + this.errors.map((row) => row.site.name).join(", ") +
        ". Ngày trống chưa chắc là ngày chưa có bài." });
      for (const row of this.errors) root.createEl("p", { cls: "setting-item-description",
        text: row.site.name + ": " + row.error });
    }
    if (this.results.some((row) => row.snapshot.truncated)) {
      root.createEl("p", { cls: "hks-post-calendar-warning", text:
        "Có Site vượt giới hạn 500 Post trong khoảng xem. Hãy lọc Site; lịch đang hiển thị chưa đầy đủ." });
    }
    const summaries = root.createDiv({ cls: "hks-post-calendar-summaries" });
    for (const { site, snapshot } of this.results) {
      const card = summaries.createDiv({ cls: "hks-post-calendar-summary" +
        (site.uid === this.focusedSiteUid ? " hks-post-calendar-focused" : "") });
      card.createEl("strong", { text: site.name });
      card.createEl("span", { text: snapshot.futureCount + " bài đang chờ" });
      card.createEl("span", { text: snapshot.lastFuture
        ? "Lên lịch tới " + snapshot.lastFuture.toLocaleDateString("vi-VN")
        : "Chưa có bài chờ đăng" });
    }
    const byDay = new Map();
    for (const { site, snapshot } of this.results) for (const event of snapshot.events) {
      const key = hksCalendarDay(event.when);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push({ ...event, site });
    }
    for (const list of byDay.values()) list.sort((a, b) => a.when - b.when);
    const grid = root.createDiv({ cls: "hks-post-calendar-grid" });
    for (const label of ["T2","T3","T4","T5","T6","T7","CN"])
      grid.createEl("div", { cls: "hks-post-calendar-weekday", text: label });
    const start = hksCalendarRange(this.month).start;
    const today = hksCalendarDay(new Date());
    for (let i = 0; i < 42; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
      const key = hksCalendarDay(date);
      const events = byDay.get(key) || [];
      const cannotSchedule = this.disablePastDates && key < today;
      const classes = ["hks-post-calendar-day"];
      if (date.getMonth() !== this.month.getMonth()) classes.push("hks-post-calendar-outside");
      if (key === today) classes.push("hks-post-calendar-today");
      if (key === this.selectedDay) classes.push("hks-post-calendar-selected");
      if (events.length) classes.push("hks-post-calendar-occupied");
      if (cannotSchedule) classes.push("hks-post-calendar-past");
      const cell = grid.createEl("button", { cls: classes.join(" "), attr: {
        type: "button", "aria-label": key + ", " + events.length + " bài" +
          (cannotSchedule ? ", ngày đã qua, không thể lên lịch" : "") } });
      if (cannotSchedule) {
        cell.disabled = true;
        cell.title = "Ngày đã qua — không thể chọn để lên lịch";
      }
      cell.createEl("strong", { text: String(date.getDate()) });
      if (key === today) cell.createEl("span", {
        cls: "hks-post-calendar-today-label", text: "Hôm nay" });
      for (const event of events.slice(0, 2)) {
        const chip = cell.createEl("span", {
        cls: "hks-post-calendar-event", text:
          event.when.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) +
          " · " + event.site.name + " · " + event.title });
        if (this.onOpenEvent) {
          chip.addClass("hks-post-calendar-event-action");
          chip.title = "Xem chi tiết bài và quản lý lịch";
          chip.addEventListener("click", (e) => {
            e?.stopPropagation?.();
            this.onOpenEvent(event);
          });
        }
      }
      if (events.length > 2) cell.createEl("span", {
        cls: "hks-post-calendar-more", text: "+" + (events.length - 2) + " bài" });
      cell.addEventListener("click", () => {
        if (this.disablePastDates && key < hksCalendarDay(new Date())) return;
        this.selectedDay = key;
        if (this.onSelectDate) this.onSelectDate(key);
        this.render();
      });
    }
    const details = root.createDiv({ cls: "hks-post-calendar-details" });
    details.createEl("h4", { text: "Ngày " + this.selectedDay.split("-").reverse().join("/") });
    const selected = byDay.get(this.selectedDay) || [];
    if (!selected.length) details.createEl("p", { text: this.errors.length
      ? "Chưa thấy bài trong dữ liệu đã tải; một số Site chưa tải được."
      : "Chưa có bài lên lịch ngày này." });
    for (const event of selected) {
      const label =
      event.when.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) +
      " · " + event.site.name + " · " + event.title +
      (event.state === "planned" ? " · Đang chờ đăng" : " · Đã đến giờ đăng (chưa xác minh trang công khai)");
      if (this.onOpenEvent) {
        const action = details.createEl("button", { cls: "hks-post-calendar-detail-action",
          text: label, attr: { type: "button" } });
        action.addEventListener("click", () => this.onOpenEvent(event));
      } else details.createEl("p", { text: label });
    }
  }
};
var HakiSendCalendarCancelConfirmModal = class extends import_obsidian.Modal {
  constructor(app, event, confirm) {
    super(app); this.event = event; this.confirm = confirm; this.busy = false;
  }
  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "Xác nhận hủy lịch đăng" });
    c.createEl("p", { text: "Bài: " + this.event.title });
    c.createEl("p", { text: "Hủy lịch sẽ chuyển Post về bản nháp trên HakiSend và ngừng đăng tự động. Nội dung bài viết được giữ lại." });
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Quay lại")
      .onClick(() => this.close())).addButton((b) => b.setButtonText("Xác nhận hủy lịch")
      .setCta().onClick(async () => {
        if (this.busy) return;
        this.busy = true; b.setDisabled(true);
        try { if (await this.confirm()) this.close(); }
        finally { this.busy = false; b.setDisabled(false); }
      }));
  }
  onClose() { this.contentEl.empty(); }
};
var HakiSendPostCalendarEventModal = class extends import_obsidian.Modal {
  constructor(app, plugin, event, afterMutation) {
    super(app); this.plugin = plugin; this.event = event; this.afterMutation = afterMutation;
  }
  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "Chi tiết lịch xuất bản" });
    c.createEl("p", { text: this.event.title });
    c.createEl("p", { text: "Site: " + this.event.site.name });
    c.createEl("p", { text: "Lịch đăng: " + this.event.when.toLocaleString("vi-VN") });
    const stateLine = c.createEl("p", { text: "Trạng thái: " + (this.event.state === "planned"
      ? "Đang chờ đăng" : "Đã đến giờ đăng — cần kiểm tra trạng thái công khai") });
    if (this.event.state === "time_reached" && this.event.externalId) {
      new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Kiểm tra trang công khai")
        .onClick(async () => {
          b.setDisabled(true);
          try {
            const found = await this.plugin.checkCalendarPublicPost(this.event);
            stateLine.setText(found === "published" ? "Trạng thái: Đã xuất bản (trang công khai đã xác minh)" :
              "Trạng thái: Đã đến giờ nhưng chưa xác minh được trang công khai. Hãy kiểm tra Site.");
          } catch (error) {
            stateLine.setText("Kiểm tra trang công khai thất bại: " + String(error).slice(0, 160));
          } finally { b.setDisabled(false); }
        }));
    }
    let source = null;
    try { source = this.plugin.findCalendarOriginalPost(this.event); }
    catch (error) { c.createEl("p", { cls: "hks-post-calendar-warning", text: String(error) }); }
    if (!source) {
      c.createEl("p", { cls: "setting-item-description", text:
        "Không tìm thấy duy nhất Post gốc trong Vault này. Có thể xem lịch, nhưng không sửa hoặc hủy để tránh tác động nhầm bài." });
      return;
    }
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Mở bài viết gốc")
      .setCta().onClick(async () => {
        this.close();
        await this.app.workspace.getLeaf(false).openFile(source);
      }));
    if (this.event.state !== "planned" || this.event.when.getTime() <= Date.now()) return;
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Chỉnh thời gian đăng")
      .onClick(async () => {
        this.close();
        await this.app.workspace.getLeaf(false).openFile(source);
        this.plugin.openScheduleCurrentNote(this.afterMutation);
      })).addButton((b) => b.setButtonText("Hủy lịch đăng")
      .onClick(async () => {
        await this.app.workspace.getLeaf(false).openFile(source);
        new HakiSendCalendarCancelConfirmModal(this.app, this.event, async () => {
        const success = await this.plugin.cancelCalendarPostSchedule(this.event, source);
        if (success) {
          this.close();
          await this.afterMutation?.();
        }
        return success;
        }).open();
      }));
  }
  onClose() { this.contentEl.empty(); }
};
var HakiSendPostCalendarModal = class extends import_obsidian.Modal {
  constructor(app, plugin) { super(app); this.plugin = plugin; this.panel = null; }
  onOpen() {
    this.titleEl.setText("HakiSend · Lịch xuất bản Posts");
    this.modalEl.addClass("hks-post-calendar-modal");
    this.panel = new HakiSendPostCalendarPanel(this.contentEl, this.plugin.settings.sites,
      (uid, from, to) => this.plugin.loadUnifiedPublishingCalendar(uid, from, to), {
        onOpenEvent: (event) => new HakiSendPostCalendarEventModal(this.app, this.plugin, event, async () => { await this.panel?.load(); }).open()
      });
  }
  onClose() { this.panel?.dispose(); this.contentEl.empty(); }
};
var HakiSendFacebookEventModal = class extends import_obsidian.Modal {
  constructor(app, plugin, event, afterMutation) {
    super(app); this.plugin = plugin; this.event = event; this.afterMutation = afterMutation; this.busy = false;
  }
  onOpen() {
    const c = this.contentEl; c.empty();
    c.createEl("h2", { text: "Facebook · Chi tiết lịch đăng" });
    c.createEl("p", { text: this.event.title });
    c.createEl("p", { text: "Fanpage: " + this.event.pageName + " · Site: " + this.event.site.name });
    c.createEl("p", { text: "Thời gian: " + this.event.when.toLocaleString("vi-VN") });
    const status = c.createEl("p", { text: "Trạng thái: " + this.event.state });
    let source = null;
    try { source = this.plugin.findCalendarOriginalPost(this.event); }
    catch (error) { c.createEl("p", { text: String(error) }); }
    if (source) new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Mở Post gốc").onClick(async () => {
      this.close(); await this.app.workspace.getLeaf(false).openFile(source);
    }));
    const after = async () => { this.close(); await this.afterMutation?.(); };
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Kiểm tra trạng thái Meta").onClick(async () => {
      b.setDisabled(true);
      try {
        const data2 = await this.plugin.facebookApi(this.event.siteUid,
          "/deliveries/" + this.event.deliveryUid + "/reconcile", "POST");
        status.setText("Trạng thái: " + data2.status + (data2.verified ? " · Meta đã xác minh" : " · Chưa xác minh"));
        if (data2.permalink_url && /^https:\/\/www\.facebook\.com\//.test(data2.permalink_url)) {
          new import_obsidian.Setting(c).addButton((open) => open.setButtonText("Mở bài Facebook")
            .onClick(() => window.open(data2.permalink_url, "_blank", "noopener,noreferrer")));
        }
        await this.afterMutation?.();
      } catch (error) { status.setText("Không thể đối soát: " + String(error).slice(0, 220)); }
      finally { b.setDisabled(false); }
    }));
    if (this.event.state !== "scheduled" || this.event.when.getTime() <= Date.now()) return;
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Hủy lịch Fanpage").onClick(async () => {
      if (!window.confirm("Hủy lịch của " + this.event.pageName + "? HakiSend sẽ yêu cầu Meta xóa bài đã hẹn.")) return;
      b.setDisabled(true);
      try {
        await this.plugin.facebookApi(this.event.siteUid,
          "/deliveries/" + this.event.deliveryUid + "/action", "POST", { action: "cancel" });
        new import_obsidian.Notice("Meta đã xác nhận hủy lịch Fanpage."); await after();
      } catch (error) { new import_obsidian.Notice("Hủy lịch chưa được xác nhận: " + String(error).slice(0, 200)); }
      finally { b.setDisabled(false); }
    }));
    const row = c.createDiv();
    row.createEl("p", { text: "Đổi ngày giờ đăng" });
    const input = row.createEl("input", { attr: { type: "datetime-local", min: localInputValue(new Date(Date.now() + 11 * 6e4)) } });
    input.value = localInputValue(this.event.when);
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Xác nhận đổi lịch").onClick(async () => {
      const date2 = new Date(input.value);
      if (!Number.isFinite(date2.getTime()) || date2.getTime() < Date.now() + 10 * 6e4) {
        new import_obsidian.Notice("Chọn giờ trong tương lai, cách hiện tại hơn 10 phút."); return;
      }
      b.setDisabled(true);
      try {
        await this.plugin.facebookApi(this.event.siteUid,
          "/deliveries/" + this.event.deliveryUid + "/action", "POST", {
            action: "reschedule", scheduled_at: isoWithLocalOffset(date2)
          });
        new import_obsidian.Notice("Meta đã xác nhận lịch Facebook mới."); await after();
      } catch (error) { new import_obsidian.Notice("Đổi lịch chưa được xác nhận: " + String(error).slice(0, 220)); }
      finally { b.setDisabled(false); }
    }));
  }
  onClose() { this.contentEl.empty(); }
};
var HakiSendFacebookComposerModal = class extends import_obsidian.Modal {
  constructor(app, plugin, file, siteUid, post) {
    super(app); this.plugin=plugin; this.file=file; this.siteUid=siteUid; this.post=post;
    this.selected=new Set(); this.pages=[]; this.message=post.title; this.scheduledAt=""; this.firstComment="";
  }
  onOpen() {
    this.titleEl.setText("HakiSend · Xuất bản lên Facebook Fanpage");
    this.modalEl.addClass("hks-facebook-composer-modal");
    const c=this.contentEl; c.empty();
    c.createEl("p", { text: "Post gốc: " + this.post.title });
    c.createEl("p", { text: "Chọn một hoặc nhiều Fanpage. HakiSend khóa từng cặp Post × Fanpage đã gửi/hẹn giờ." });
    const pageContainer=c.createDiv();
    const status=c.createDiv({ cls:"setting-item-description" });
    status.setText("Đang tải Page đã kết nối từ HakiSend…");
    new import_obsidian.Setting(c).setName("Nội dung đăng Facebook")
      .addTextArea((t)=>t.setValue(this.message).onChange((v)=>{this.message=v;}));
    new import_obsidian.Setting(c).setName("Bình luận đầu tiên (tùy chọn)")
      .setDesc("HakiSend chỉ đăng bình luận sau khi Meta xác nhận bài đã công khai. Link có thể đặt tại đây.")
      .addTextArea((t)=>t.setValue(this.firstComment).onChange((v)=>{this.firstComment=v;}));
    new import_obsidian.Setting(c).setName("Hẹn ngày và giờ (để trống để gửi ngay)")
      .addText((t)=>{
        const input=t.inputEl; input.type="datetime-local";
        input.min=localInputValue(new Date(Date.now()+11*6e4));
        input.onchange=()=>{this.scheduledAt=input.value;};
      });
    new import_obsidian.Setting(c).addButton((b)=>b.setButtonText("Mở trang quản lý Fanpage")
      .onClick(()=>window.open(normalizeBaseUrl(this.plugin.settings.apiBaseUrl)+"/rui/facebook-publisher","_blank","noopener,noreferrer")));
    new import_obsidian.Setting(c).addButton((b)=>b.setButtonText("Gửi / đặt lịch lên Fanpage").setCta().onClick(async ()=>{
      if (!this.selected.size) { new import_obsidian.Notice("Hãy chọn ít nhất một Page chưa gửi."); return; }
      const when=this.scheduledAt ? new Date(this.scheduledAt) : null;
      if (when && (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()+10*6e4)) {
        new import_obsidian.Notice("Lịch Facebook phải sau hiện tại ít nhất 10 phút.");return;
      }
      if (!this.message.trim() || this.message.length>5000) { new import_obsidian.Notice("Nội dung phải có 1–5000 ký tự.");return; }
      if (!window.confirm("Xác nhận " + (when?"hẹn lịch":"gửi ngay") + " lên " + this.selected.size + " Fanpage?")) return;
      b.setDisabled(true); status.setText("Đang gửi yêu cầu tới HakiSend, không đóng cửa sổ…");
      try {
        if (this.app.workspace.getActiveFile()?.path!==this.file.path)
          throw Error("Đã chuyển khỏi Post gốc. Hãy mở lại và thực hiện.");
        const payload={page_uids:Array.from(this.selected),message:this.message.trim()};
        if(this.firstComment.trim())payload.first_comment=this.firstComment.trim();
        if (when) payload.scheduled_at=isoWithLocalOffset(when);
        const result=await this.plugin.facebookApi(this.siteUid,
          "/posts/"+this.post.uid+"/deliveries","POST",payload);
        status.setText(Object.entries(result.results||{}).map(([id, row])=>{
          const page=this.pages.find((p)=>p.uid===id);
          return (page?.name||id)+": "+row.status+(row.error_code?" ("+row.error_code+")":"");
        }).join(" · ") || "Không có xác nhận từ HakiSend.");
        this.selected.clear(); await this.loadPages(pageContainer);
      } catch(error) { status.setText("HakiSend chưa xác nhận kết quả: "+String(error).slice(0,220)+". Kiểm tra lịch trước khi thử lại."); }
      finally {b.setDisabled(false);}
    }));
    void this.loadPages(pageContainer).then(()=>status.setText("Chọn các Fanpage chưa sử dụng cho Post này.")).catch((e)=>status.setText("Không tải được Page: "+String(e).slice(0,220)));
  }
  async loadPages(container) {
    const response=await this.plugin.facebookApi(this.siteUid,
      "/pages?post_uid="+encodeURIComponent(this.post.uid),"GET");
    if (!Array.isArray(response.pages)) throw Error("API không trả danh sách Page.");
    this.pages=response.pages;this.selected.clear();container.empty();
    if (!this.pages.length) { container.createEl("p",{text:"Chưa kết nối Fanpage cho Site này. Chọn 'Mở trang quản lý Fanpage' để kết nối Facebook."});return;}
    for(const page of this.pages){
      const reserved=page.already_claimed===true;
      new import_obsidian.Setting(container).setName(page.name)
        .setDesc(reserved?"Đã có lịch/gửi: "+page.post_status+" · Không gửi trùng":"Page ID: "+page.page_id)
        .addToggle((t)=>t.setValue(false).setDisabled(reserved).onChange((on)=>{
          if (on)this.selected.add(page.uid);else this.selected.delete(page.uid);
        }));
    }
  }
  onClose(){this.selected.clear();this.contentEl.empty();}
};
var HakiSendScheduleModal = class extends import_obsidian.Modal {
  constructor(app, initialPublish, initialUnpublish, onSubmit, plugin = null, focusedSiteUid = "") {
    super(app);
    this.initialPublish = initialPublish;
    this.initialUnpublish = initialUnpublish;
    this.onSubmit = onSubmit;
    this.plugin = plugin;
    this.focusedSiteUid = focusedSiteUid;
    this.calendarPanel = null;
    this.publishInput = null;
    this.unpublishInput = null;
  }
  onOpen() {
    var _a;
    const {
      contentEl
    } = this;
    contentEl.empty();
    contentEl.createEl(
      "h2",
      {
        text: "Lên lịch xuất bản bài viết"
      }
    );
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local timezone";
    contentEl.createEl(
      "p",
      {
        text: `Múi giờ đang dùng: ${timezone}`,
        cls: "setting-item-description"
      }
    );
    const defaultPublish = (_a = this.initialPublish) != null ? _a : new Date(
      Date.now() + 60 * 60 * 1e3
    );
    const publishSetting = new import_obsidian.Setting(
      contentEl
    ).setName(
      "Ngày và giờ đăng bài"
    ).setDesc(
      "Chọn ngày trên lịch bên dưới hoặc nhập trực tiếp ngày và giờ."
    );
    this.publishInput = publishSetting.controlEl.createEl(
      "input"
    );
    this.publishInput.type = "datetime-local";
    this.publishInput.min = localInputValue(new Date(Date.now() + 60 * 1e3));
    this.publishInput.value = localInputValue(
      defaultPublish
    );
    const unpublishSetting = new import_obsidian.Setting(
      contentEl
    ).setName(
      "Ngày và giờ ngừng hiển thị"
    ).setDesc(
      "Tùy chọn. Để trống nếu muốn bài tiếp tục hiển thị."
    );
    this.unpublishInput = unpublishSetting.controlEl.createEl(
      "input"
    );
    this.unpublishInput.type = "datetime-local";
    if (this.initialUnpublish) {
      this.unpublishInput.value = localInputValue(
        this.initialUnpublish
      );
    }
    if (this.plugin) {
      this.modalEl.addClass("hks-post-calendar-modal");
      const host = contentEl.createDiv({ cls: "hks-post-calendar-host" });
      this.calendarPanel = new HakiSendPostCalendarPanel(
        host, this.plugin.settings.sites,
        (uid, from, to) => this.plugin.loadUnifiedPublishingCalendar(uid, from, to),
        { focusedSiteUid: this.focusedSiteUid, initialDate: defaultPublish,
          disablePastDates: true,
          onSelectDate: (day) => {
            if (!this.publishInput) return;
            const previous = this.publishInput.value;
            const hhmm = /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(previous)
              ? previous.slice(11, 16) : "09:00";
            const candidate = new Date(day + "T" + hhmm);
            this.publishInput.value = candidate.getTime() <= Date.now() &&
              day === hksCalendarDay(new Date())
              ? localInputValue(new Date(Date.now() + 5 * 60 * 1e3))
              : day + "T" + hhmm;
          } }
      );
      this.publishInput.addEventListener("change", () => {
        const date = new Date(this.publishInput.value);
        if (!Number.isFinite(date.getTime()) || !this.calendarPanel) return;
        this.calendarPanel.month = new Date(date.getFullYear(), date.getMonth(), 1, 12);
        this.calendarPanel.selectedDay = hksCalendarDay(date);
        void this.calendarPanel.load();
      });
    }
    const scheduleActions = new import_obsidian.Setting(
      contentEl
    ).addButton(
      (button) => {
        button.setButtonText(
          "Hủy"
        ).onClick(
          () => {
            this.close();
          }
        );
      }
    ).addButton(
      (button) => {
        button.setButtonText(
          "Xác nhận lên lịch"
        ).setCta().onClick(
          async () => {
            await this.submit();
          }
        );
      }
    );
    scheduleActions.settingEl.addClass("hks-post-calendar-actions");
  }
  async submit() {
    var _a, _b, _c, _d;
    const publishRaw = (_b = (_a = this.publishInput) == null ? void 0 : _a.value.trim()) != null ? _b : "";
    if (!publishRaw) {
      new import_obsidian.Notice(
        "Choose a publish date and time."
      );
      return;
    }
    const publishDate = new Date(
      publishRaw
    );
    if (Number.isNaN(
      publishDate.getTime()
    )) {
      new import_obsidian.Notice(
        "Invalid publish date."
      );
      return;
    }
    if (publishDate.getTime() <= Date.now()) {
      new import_obsidian.Notice(
        "Publish time must be in the future."
      );
      return;
    }
    const unpublishRaw = (_d = (_c = this.unpublishInput) == null ? void 0 : _c.value.trim()) != null ? _d : "";
    let unpublishDate = null;
    if (unpublishRaw) {
      unpublishDate = new Date(
        unpublishRaw
      );
      if (Number.isNaN(
        unpublishDate.getTime()
      )) {
        new import_obsidian.Notice(
          "Invalid unpublish date."
        );
        return;
      }
      if (unpublishDate.getTime() <= publishDate.getTime()) {
        new import_obsidian.Notice(
          "Unpublish time must be later than publish time."
        );
        return;
      }
    }
    const values = {
      publishAtIso: isoWithLocalOffset(
        publishDate
      ),
      unpublishAtIso: unpublishDate ? isoWithLocalOffset(
        unpublishDate
      ) : null,
      display: `${publishRaw.replace(
        "T",
        " "
      )} \xB7 ${Intl.DateTimeFormat().resolvedOptions().timeZone || "local"}`
    };
    this.close();
    await this.onSubmit(
      values
    );
  }
  onClose() {
    this.calendarPanel?.dispose();
    this.contentEl.empty();
  }
};
var HakiSendLocalEmailPlannerModal = class extends import_obsidian.Modal {
  constructor(app, sites, defaultSiteUid, loadAuthorizedLists) {
    var _a, _b, _c, _d, _e, _f;
    super(app);
    this.sites = sites;
    this.loadAuthorizedLists = loadAuthorizedLists;
    this.audienceRows = [];
    this.audienceRevision = 0;
    this.audienceContainer = null;
    this.audienceLoading = false;
    this.loadAudienceButton = null;
    this.conditional = null;
    this.busy = false;
    const file = this.app.workspace.getActiveFile();
    const fm = file ? (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {} : {};
    const source = localEmailSourceContext(
      (_c = file == null ? void 0 : file.path) != null ? _c : null,
      (_d = file == null ? void 0 : file.extension) != null ? _d : null,
      fm
    );
    const siteUid = this.sites.some((s) => s.uid === source.sourceSiteUid) ? source.sourceSiteUid : this.sites.some((s) => s.uid === defaultSiteUid) ? defaultSiteUid : (_f = (_e = this.sites[0]) == null ? void 0 : _e.uid) != null ? _f : "";
    this.form = {
      kind: "standalone",
      siteUid,
      subject: "",
      listUid: "",
      sendPolicy: "now",
      scheduleInput: "",
      ...source
    };
  }
  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "Bước 1 · Tạo email mới" });
    c.createEl("p", { text: "Chọn trang web, đặt tiêu đề, rồi viết nội dung. Email chỉ được gửi khi bạn xác nhận ở bước cuối." });
    if (this.sites.length === 0) {
      c.createEl("p", { text: "Hãy kết nối tài khoản HakiSend trong phần Cài đặt trước khi tạo email." });
      return;
    }
    new import_obsidian.Setting(c).setName("Trang web").setDesc("Chọn trang web muốn gửi email.").addDropdown((d) => {
      for (const site of this.sites) d.addOption(site.uid, site.name);
      d.setValue(this.form.siteUid);
      d.onChange((value) => {
        this.form.siteUid = value;
        this.form.listUid = "";
        this.audienceRows = [];
        this.audienceRevision++;
        this.renderAudienceSelector();
        void this.refreshAuthorizedLists();
      });
    });
    new import_obsidian.Setting(c).setName("Loại email").addDropdown((d) => d.addOption("standalone", "Email thông thường").setValue(this.form.kind).onChange((value) => {
      this.form.kind = value;
      this.form.sendPolicy = value === "post_linked_free" ? "on_publication" : "now";
      this.form.scheduleInput = "";
      this.drawConditional();
    }));
    c.createEl("p", { text: "Muốn thông báo bài viết mới? Mở Post đã xuất bản rồi chọn lệnh 'HakiSend: Tạo email thông báo từ Post đã xuất bản'." });
    new import_obsidian.Setting(c).setName("Tiêu đề email").addText((t) => t.setPlaceholder("Ví dụ: Thư gửi các thành viên").onChange((value) => {
      this.form.subject = value;
    }));
    this.audienceContainer = c.createDiv();
    this.renderAudienceSelector();
    new import_obsidian.Setting(c).setName("Danh sách người nhận").setDesc("Danh sách được tải tự động từ HakiSend; bạn cũng có thể tải lại.").addButton((b) => {
      this.loadAudienceButton = b;
      b.setButtonText("Tải lại").onClick(async () => this.refreshAuthorizedLists());
    });
    this.conditional = c.createDiv();
    this.drawConditional();
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Tạo bản nháp để viết email").setCta().onClick(async () => {
      var _a, _b, _c, _d;
      if (this.busy) return;
      this.busy = true;
      b.setDisabled(true);
      try {
        const args = { ...this.form };
        if (args.listUid && !this.audienceRows.some((row) => row.uid === args.listUid)) throw Error("Select an authorized List from the loaded dropdown.");
        if (args.kind === "standalone") {
          args.sourceNote = "";
          args.postUid = "";
          args.sourceSiteUid = "";
          args.isReadOnlySnapshot = false;
        } else {
          const file = this.app.workspace.getActiveFile();
          const fm = file ? (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {} : {};
          const fresh = localEmailSourceContext(
            (_c = file == null ? void 0 : file.path) != null ? _c : null,
            (_d = file == null ? void 0 : file.extension) != null ? _d : null,
            fm
          );
          if (!fresh.sourceNote || fresh.sourceNote !== args.sourceNote || fresh.sourceSiteUid !== args.sourceSiteUid || fresh.postUid !== args.postUid || fresh.isReadOnlySnapshot !== args.isReadOnlySnapshot) {
            throw Error("The source Post changed. Reopen the Email Planner.");
          }
        }
        const draft = normalizeLocalEmailPlan(args);
        if (!this.sites.some((s) => s.uid === draft.siteUid)) {
          throw Error("Selected HakiSend Site is no longer available.");
        }
        const paths = localEmailPlanPaths(
          draft.siteUid,
          draft.kind,
          draft.subject
        );
        if (!this.app.vault.getAbstractFileByPath(paths.root)) {
          await this.app.vault.createFolder(paths.root);
        }
        if (!this.app.vault.getAbstractFileByPath(paths.directory)) {
          await this.app.vault.createFolder(paths.directory);
        }
        let created = null;
        for (let n = 1; n <= 1e3; n++) {
          const path = paths.directory + "/" + paths.basename + (n === 1 ? "" : " (" + n + ")") + ".md";
          if (this.app.vault.getAbstractFileByPath(path)) continue;
          created = await this.app.vault.create(
            path,
            serializeLocalEmailPlan(draft, {
              siteName: this.sites.find((site) => site.uid === draft.siteUid)?.name || "",
              listName: this.audienceRows.find((row) => row.uid === draft.listUid)?.name || ""
            })
          );
          break;
        }
        if (!created) throw Error("Too many duplicate Email Plan names.");
        this.close();
        await this.app.workspace.getLeaf(true).openFile(created);
        new import_obsidian.Notice("Đã tạo bản nháp. Hãy viết nội dung, sau đó nhấn nút Email HakiSend để tiếp tục.");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown failure";
        new import_obsidian.Notice("Chưa tạo được email: " + msg.slice(0, 180));
      } finally {
        this.busy = false;
        b.setDisabled(false);
      }
    }));
    c.createEl("p", { text: "Chưa có email nào được gửi ở bước này." });
    void this.refreshAuthorizedLists();
  }
  async refreshAuthorizedLists() {
    const site = this.form.siteUid;
    const revision = ++this.audienceRevision;
    this.audienceLoading = true;
    if (this.loadAudienceButton) this.loadAudienceButton.setDisabled(true);
    this.renderAudienceSelector();
    try {
      if (typeof this.loadAuthorizedLists !== "function") throw Error("Chưa kết nối HakiSend.");
      const rows = await this.loadAuthorizedLists(site);
      if (revision !== this.audienceRevision || site !== this.form.siteUid) return;
      if (!Array.isArray(rows) || rows.length > 500 || !rows.every(isAudience)) throw Error("Danh sách trả về không hợp lệ.");
      this.audienceRows = rows;
      this.form.listUid = "";
      if (rows.length === 0) new import_obsidian.Notice("Trang web này chưa có danh sách người nhận.");
    } catch (error) {
      if (revision === this.audienceRevision && site === this.form.siteUid) {
        this.audienceRows = [];
        this.form.listUid = "";
        new import_obsidian.Notice("Chưa tải được danh sách người nhận: " + String(error).slice(0, 120));
      }
    } finally {
      if (revision === this.audienceRevision) {
        this.audienceLoading = false;
        this.renderAudienceSelector();
        if (this.loadAudienceButton) this.loadAudienceButton.setDisabled(false);
      }
    }
  }
  renderAudienceSelector() {
    const c = this.audienceContainer;
    if (!c) return;
    c.empty();
    new import_obsidian.Setting(c).setName("Gửi tới danh sách").setDesc("Chọn danh sách email muốn gửi đến.").addDropdown((d) => {
      d.addOption("", this.audienceLoading ? "Đang tải danh sách..." : this.audienceRows.length ? "Chọn danh sách người nhận" : "Chưa có danh sách");
      for (const row of this.audienceRows) d.addOption(row.uid, row.name);
      d.setValue(this.audienceRows.some((row) => row.uid === this.form.listUid) ? this.form.listUid : "");
      d.setDisabled(this.audienceRows.length === 0);
      d.onChange((value) => {
        this.form.listUid = value;
      });
    });
  }
  drawConditional() {
    var _a;
    const c = this.conditional;
    if (!c) return;
    c.empty();
    if (this.form.kind === "post_linked_free") {
      c.createEl("p", { text: "Editable source Post: " + ((_a = this.form.sourceNote) != null ? _a : "") });
      c.createEl("p", { text: "Policy: on publication only. There is no separate Email schedule, and the server must verify public guest visibility before sending." });
    } else {
      c.createEl("p", { text: "Bạn sẽ chọn Gửi ngay hoặc Đặt lịch ở bước cuối, sau khi kiểm tra email." });
    }
  }
  onClose() {
    this.audienceRevision++;
    this.conditional = null;
    this.audienceContainer = null;
    this.loadAudienceButton = null;
    this.contentEl.empty();
  }
};
var HakiSendLocalEmailPlanBrowserModal = class extends import_obsidian.Modal {
  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "Local HakiSend Email Plans" });
    c.createEl("p", { text: "Vault-only plans. No entry here is evidence of an actual Campaign schedule or delivery." });
    const all = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("HakiSend Emails/")).sort((a, b) => a.path.localeCompare(b.path));
    if (all.length === 0) {
      c.createEl("p", { text: "No local Email Plans found." });
      return;
    }
    for (const file of all.slice(0, 100)) {
      new import_obsidian.Setting(c).setName(file.basename).setDesc("Local only \xB7 NOT sent").addButton((b) => b.setButtonText("Open").onClick(() => {
        this.close();
        void this.app.workspace.getLeaf(true).openFile(file);
      }));
    }
    if (all.length > 100) c.createEl("p", { text: "Showing 100 of " + all.length + " local notes." });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var HakiSendPrivateEmailBrowserModal = class extends import_obsidian.Modal {
  constructor(app, sites, loadRows, loadDetail) {
    super(app);
    this.sites = sites;
    this.loadRows = loadRows;
    this.loadDetail = loadDetail;
    this.siteUid = "";
    this.sequence = 0;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Private Standalone Email Drafts" });
    contentEl.createEl("p", {
      text: "Read-only server view. Nothing will be sent, scheduled, synced, or copied into your Vault."
    });
    const results = contentEl.createDiv();
    new import_obsidian.Setting(contentEl).setName("HakiSend Site").setDesc("Choose a Site explicitly; emails from other Sites are never requested.").addDropdown((dropdown) => {
      dropdown.addOption("", "Choose Site");
      for (const site of this.sites) {
        dropdown.addOption(site.uid, site.name);
      }
      dropdown.onChange((value) => {
        this.siteUid = value;
        this.sequence++;
        results.empty();
      });
    });
    new import_obsidian.Setting(contentEl).addButton((button) => button.setButtonText("Load private drafts").onClick(async () => {
      if (!this.siteUid || !this.sites.some((s) => s.uid === this.siteUid)) {
        new import_obsidian.Notice("Choose an authorized HakiSend Site.");
        return;
      }
      const chosen = this.siteUid;
      const current = ++this.sequence;
      results.empty();
      results.createEl("p", { text: "Loading private Email Draft metadata..." });
      try {
        const rows = await this.loadRows(chosen);
        if (current !== this.sequence || chosen !== this.siteUid) return;
        results.empty();
        results.createEl("p", {
          text: rows.length ? "Only unsent private Draft metadata is shown." : "No accessible private Email Drafts were returned."
        });
        const list = results.createEl("ul");
        for (const row of rows) {
          const item = list.createEl("li");
          item.createEl("strong", { text: row.subject });
          item.createSpan({ text: " \xB7 Revision " + row.revision + " \xB7 Private Draft \u2014 NOT sent" });
          const detailBox = item.createDiv();
          new import_obsidian.Setting(item).addButton((button2) => button2.setButtonText("Read-only preview").onClick(async () => {
            if (chosen !== this.siteUid || current !== this.sequence) return;
            const reqSeq = this.sequence;
            detailBox.empty();
            detailBox.createEl("p", { text: "Reading the private Draft..." });
            try {
              const detail = await this.loadDetail(chosen, row.uid);
              if (reqSeq !== this.sequence || chosen !== this.siteUid) return;
              detailBox.empty();
              detailBox.createEl("p", { text: "Server Draft \xB7 Revision " + detail.revision + " \xB7 NOT sent" });
              detailBox.createEl("pre", { text: detail.body });
            } catch (e) {
              if (reqSeq !== this.sequence) return;
              detailBox.empty();
              detailBox.createEl("p", { text: "Private Draft preview unavailable." });
            }
          }));
        }
        results.createEl("p", {
          text: "HakiSend returns at most 50 records and does not provide a cursor. This view may be incomplete."
        });
      } catch (e) {
        if (current !== this.sequence) return;
        results.empty();
        results.createEl("p", {
          text: "Cannot read this Site's private drafts. Check connection, permissions, or network."
        });
      }
    }));
  }
  onClose() {
    this.sequence++;
    this.contentEl.empty();
  }
};
var HakiSendManualDraftSaveModal = class extends import_obsidian.Modal {
  constructor(app, plan, authorizedAudiences, onSave, onCompleted = null, onCancelled = null) {
    super(app);
    this.plan = plan;
    this.authorizedAudiences = authorizedAudiences;
    this.onSave = onSave;
    this.onCompleted = onCompleted;
    this.onCancelled = onCancelled;
    this.selectedListUid = "";
    this.busy = false;
    this.selectedListUid = plan.listUid;
  }
  onOpen() {
    this.renderInto(this.contentEl);
  }
  renderInto(c) {
    c.empty();
    c.createEl("h2", { text: "Bước 1/3 · Lưu bản nháp lên HakiSend" });
    c.createEl("p", {
      text: "HakiSend lưu nội dung để chuẩn bị gửi. Người nhận chưa nhận được email ở bước này."
    });
    c.createEl("p", { text: "Email: " + this.plan.subject });
    new import_obsidian.Setting(c).setName("Danh sách người nhận").setDesc("Chọn danh sách đã có trên HakiSend.").addDropdown((dropdown) => {
      dropdown.addOption("", "Chọn danh sách người nhận");
      for (const item of this.authorizedAudiences) {
        dropdown.addOption(item.uid, item.name);
      }
      dropdown.setValue(this.authorizedAudiences.some((a) => a.uid === this.selectedListUid) ? this.selectedListUid : "");
      dropdown.onChange((value) => {
        this.selectedListUid = value;
      });
    });
    new import_obsidian.Setting(c).addButton((button) => button.setButtonText("Quay lại").onClick(() => {
      if (this.busy) return;
      if (this.onCancelled) void this.onCancelled();
      else this.close();
    })).addButton((button) => button.setButtonText("Lưu bản nháp").setCta().onClick(async () => {
      if (this.busy) return;
      if (!this.authorizedAudiences.some((a) => a.uid === this.selectedListUid)) {
        new import_obsidian.Notice("Hãy chọn danh sách người nhận trước.");
        return;
      }
      this.busy = true;
      button.setDisabled(true);
      try {
        await this.onSave(this.selectedListUid);
        if (this.onCompleted) await this.onCompleted();
        else this.close();
        new import_obsidian.Notice("Đã lưu bản nháp. Tiếp tục bằng lệnh 'HakiSend: 2. Tiếp tục gửi email'.");
      } catch (e) {
        new import_obsidian.Notice("Chưa xác định được kết quả lưu. Hãy dùng 'Tiếp tục gửi email' để kiểm tra lại, không tạo email mới.");
      } finally {
        this.busy = false;
        button.setDisabled(false);
      }
    }));
  }
  onClose() {
    this.contentEl.empty();
  }
};
var HakiSendManualPromotionModal = class extends import_obsidian.Modal {
  constructor(app, plan, senderDefaults, onPromote, onCompleted = null, onCancelled = null) {
    super(app);
    this.plan = plan;
    this.senderDefaults = senderDefaults;
    this.onPromote = onPromote;
    this.onCompleted = onCompleted;
    this.onCancelled = onCancelled;
    this.fromEmail = senderDefaults.from_email;
    this.fromName = senderDefaults.from_name;
    this.replyTo = senderDefaults.reply_to;
    this.acknowledged = false;
    this.busy = false;
    this.requiresReconciliation = false;
    this.feedback = null;
  }
  onOpen() {
    this.renderInto(this.contentEl);
  }
  renderInto(c) {
    c.empty();
    c.createEl("h2", { text: "Bước 2/3 · Chuẩn bị gửi email" });
    c.createEl("p", { text: "HakiSend chuẩn bị email cho danh sách đã chọn. Bước này chưa gửi email." });
    c.createEl("p", { text: "Email: " + this.plan.subject + " · Danh sách: " + this.senderDefaults.list_name });
    c.createEl("p", { text: "Thông tin người gửi được lấy từ cài đặt danh sách trên HakiSend." });
    new import_obsidian.Setting(c).setName("Email người gửi").setDesc("Đã xác minh; muốn đổi, hãy sửa trong HakiSend.").addText((input) => input.setValue(this.fromEmail).setDisabled(true));
    new import_obsidian.Setting(c).setName("Tên người gửi").addText((input) => input.setValue(this.fromName).setDisabled(true));
    new import_obsidian.Setting(c).setName("Email nhận phản hồi").addText((input) => input.setValue(this.replyTo).setDisabled(true));
    new import_obsidian.Setting(c).setName("Tôi xác nhận chuẩn bị email này (chưa gửi)").addToggle((toggle) => toggle.setValue(false).onChange((value) => {
      this.acknowledged = value;
    }));
    this.feedback = c.createEl("p", {
      text: "Bước này chỉ chuẩn bị Campaign. Nếu có lỗi, chi tiết sẽ hiển thị tại đây; không nhấn lại khi kết quả chưa rõ."
    });
    new import_obsidian.Setting(c).addButton((button) => button.setButtonText("Quay lại").onClick(() => {
      if (this.busy) return;
      if (this.onCancelled) void this.onCancelled();
      else this.close();
    })).addButton((button) => button.setButtonText("Chuẩn bị email").setCta().onClick(async () => {
      if (this.busy || this.requiresReconciliation) return;
      if (!this.acknowledged) {
        new import_obsidian.Notice("Hãy bật xác nhận trước khi tiếp tục.");
        return;
      }
      this.busy = true;
      button.setDisabled(true);
      let failed = false;
      try {
        this.feedback?.setText("Đang đối chiếu bản nháp trên HakiSend. Vui lòng chờ...");
        await this.onPromote({
          fromEmail: this.fromEmail,
          fromName: this.fromName,
          replyTo: this.replyTo
        });
        if (this.onCompleted) await this.onCompleted();
        else this.close();
        new import_obsidian.Notice("Đã chuẩn bị email. Tiếp tục bằng lệnh 'HakiSend: 2. Tiếp tục gửi email'.");
      } catch (e) {
        failed = true;
        this.requiresReconciliation = true;
        const cause = String(e instanceof Error ? e.message : e).replace(/Bearer\s+[^\s]+/gi, "Bearer [ẩn]").slice(0, 320);
        this.feedback?.setText("KHÔNG XÁC NHẬN ĐƯỢC BƯỚC 2: " + cause + ". Mở lại 'HakiSend: 2. Tiếp tục gửi email' để kiểm tra trạng thái. Không nhấn tạo mới hoặc chuẩn bị lại khi chưa đối chiếu mã yêu cầu.");
        new import_obsidian.Notice("Chưa chuẩn bị xong Campaign. Nguyên nhân và hướng xử lý đang hiển thị ngay trong cửa sổ.", 15e3);
      } finally {
        this.busy = false;
        // A failed call may have persisted an idempotency request before an
        // ambiguous network response. Never permit same-window re-submission.
        if (!failed) button.setDisabled(false);
      }
    }));
  }
  onClose() {
    this.contentEl.empty();
  }
};
var HakiSendEmailDeliveryReadinessModal = class extends import_obsidian.Modal {
  constructor(app, data2) {
    super(app);
    this.data = data2;
  }
  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "Email Delivery Readiness \xB7 READ ONLY" });
    c.createEl("p", { text: "Acelle Campaign: " + this.data.campaign_uid + " \xB7 Native state: " + this.data.campaign_state });
    c.createEl("p", { text: "Sending and scheduling remain DISABLED. These checks do not grant permission to send." });
    c.createEl("h3", { text: "Verified directly against HakiSend / Acelle" });
    const verified = c.createEl("ul");
    for (const [name, value] of Object.entries(this.data.checks)) {
      verified.createEl("li", { text: name.replace(/_/g, " ") + " \u2014 " + (value ? "verified" : "BLOCKED or changed") });
    }
    const counts = this.data.audience_status_counts;
    c.createEl("h3", { text: "Mailing list status snapshot (counts only)" });
    c.createEl("p", { text: "Total " + counts.total + " \xB7 Subscribed " + counts.subscribed + " \xB7 Unsubscribed " + counts.unsubscribed + " \xB7 Blacklisted " + counts.blacklisted + " \xB7 Spam reported " + counts.spam_reported + " \xB7 Unconfirmed " + counts.unconfirmed + " \xB7 Other " + counts.other });
    c.createEl("p", { text: "These are status counts, NOT proof of consent or complete suppression. No subscriber addresses were retrieved." });
    const overlap = this.data.blacklist_overlap;
    c.createEl("h3", { text: "Acelle blacklist overlaps (counts only)" });
    c.createEl("p", { text: "Subscribed entries: " + overlap.subscribed_total + " \xB7 Owner blacklist overlap: " + overlap.owner_blacklist_overlap + " \xB7 Global blacklist overlap: " + overlap.global_blacklist_overlap + " \xB7 Either blacklist: " + overlap.either_blacklist_overlap + " \xB7 Neither blacklist: " + overlap.without_either_blacklist_overlap });
    c.createEl("p", { text: "Global blacklist policy is unverified. These are read-only matches, not recipient-time suppression or permission to send." });
    const budget = this.data.budget_snapshot;
    c.createEl("h3", { text: "Email credit and rate plan snapshot" });
    const creditLabel = budget.credit_state === "limited_in_snapshot" ? String(budget.credits_remaining_snapshot) + " credits in last DB snapshot" : budget.credit_state.replace(/_/g, " ");
    c.createEl("p", { text: "Credit: " + creditLabel });
    c.createEl("p", { text: budget.rate_limit_configured ? "Plan rate cap: " + budget.rate_limit_per_window + " / " + budget.rate_window_amount + " " + budget.rate_window_unit : "Plan rate cap: not configured or no active plan" });
    c.createEl("p", { text: "Live credit balance, rate-window consumption and send quota are UNVERIFIED. A snapshot does not reserve any send capacity." });
    const provenance = this.data.consent_provenance;
    c.createEl("h3", { text: "Signup provenance (metadata only)" });
    c.createEl("p", { text: "Double-opt-in label: " + provenance.double_optin_label + " \xB7 Single-opt-in label: " + provenance.single_optin_label + " \xB7 Imported: " + provenance.imported_label + " \xB7 Admin-added: " + provenance.admin_added_label + " \xB7 Unknown: " + provenance.other_or_missing_label });
    c.createEl("p", { text: "IP metadata present: " + provenance.ip_metadata_present + " / " + provenance.subscribed_total + ". Labels and IP metadata do NOT prove marketing consent. Confirmation receipts and consent purpose remain UNVERIFIED." });
    const receipts = this.data.consent_token_receipts;
    c.createEl("h3", { text: "Subscriber confirmation evidence ledger" });
    c.createEl("p", { text: receipts.state === "disabled" ? "Evidence ledger: DISABLED / not installed. Receipt counts are UNKNOWN." : "Candidate token redemptions: " + receipts.current_subscribed_redeemed_tokens + " \xB7 Withdrawn: " + receipts.current_subscribed_withdrawn });
    c.createEl("p", { text: "Mailbox ownership, genuine recipient confirmation delivery and marketing consent remain UNVERIFIED. No sender can approve consent from this screen." });
    c.createEl("h3", { text: "Required evidence not yet verified" });
    const missing = c.createEl("ul");
    for (const [name, value] of Object.entries(this.data.compliance)) {
      missing.createEl("li", { text: name.replace(/_/g, " ") + " \u2014 " + value });
    }
    c.createEl("p", { text: "No email was sent, scheduled or modified by this check." });
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Close").onClick(() => this.close()));
  }
  onClose() {
    this.contentEl.empty();
  }
};
// Publisher R3's native preflight is the live read-only contract for Email Only.
// Do not present it as complete recipient consent or dispatch-time suppression.
var HakiSendR3ReadOnlyPreflightModal = class extends import_obsidian.Modal {
  constructor(app, result) {
    super(app);
    this.result = result;
  }
  onOpen() {
    const c = this.contentEl;
    c.empty();
    const r = this.result;
    const mandatory = [
      "site_audience", "source_content_integrity", "native_state",
      "campaign_permission", "native_setup", "sender", "unsubscribe",
      "native_recipient_count", "credit"
    ];
    const passed = mandatory.filter((key) => r.checks[key] && r.checks[key].state === "pass").length;
    const outstanding = Object.entries(r.checks).filter(([, value]) => value.state !== "pass");
    c.createEl("h2", { text: "Publisher R3 \xB7 Native Acelle Preflight \xB7 READ ONLY" });
    c.createEl("p", { text: "Site " + r.siteUid + " \xB7 Campaign " + r.campaign.uid });
    c.createEl("p", { text: r.campaign.name + " \xB7 Native state: " + r.campaign.status + " \xB7 Estimated recipients: " + (r.recipientCount === null ? "unknown" : String(r.recipientCount)) });
    c.createEl("p", { text: "Technical gates verified: " + passed + "/" + mandatory.length + ". Other checks not PASS: " + outstanding.length + "." });
    if (passed !== mandatory.length || r.campaign.status !== "new" || r.recipientCount === null || r.recipientCount < 1) {
      c.createEl("p", { text: "BLOCKED: the native Campaign does not pass all required technical checks." });
    }
    c.createEl("h3", { text: "Server-side evidence" });
    const list = c.createEl("ul");
    for (const [key, value] of Object.entries(r.checks)) {
      list.createEl("li", { text: key + " \xB7 " + value.state.toUpperCase() + " \xB7 " + value.detail });
    }
    c.createEl("h3", { text: "Checks that remain unverified" });
    if (!outstanding.length) {
      c.createEl("p", { text: "The returned preflight has no unknown/blocked checks. This does not constitute permission to send." });
    } else {
      for (const [key, value] of outstanding) {
        c.createEl("p", { text: key + ": " + value.state.toUpperCase() });
      }
    }
    c.createEl("p", { text: "HakiSend manages subscription and confirmation at the List level; Publisher does not re-collect consent for this Campaign. The worker suppression diagnostic is separate. This is a GET-only inspection, not an approval, Send Now or Schedule action." });
    c.createEl("p", { text: "No email was sent, scheduled, or modified by this check." });
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Close").onClick(() => this.close()));
  }
  onClose() {
    this.contentEl.empty();
  }
};
var HakiSendManualDraftConflictModal = class extends import_obsidian.Modal {
  constructor(app, plan, remote, acceptRevision) {
    super(app);
    this.plan = plan;
    this.remote = remote;
    this.acceptRevision = acceptRevision;
    this.acknowledged = false;
    this.busy = false;
  }
  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "Private Draft conflict \xB7 read-only comparison" });
    c.createEl("p", { text: "Local base revision " + this.plan.revision + " differs from server revision " + this.remote.revision + ". Nothing has been overwritten." });
    c.createEl("p", { text: "Local subject: " + this.plan.subject });
    c.createEl("p", { text: "Server subject: " + this.remote.subject });
    c.createEl("h3", { text: "Local Markdown at conflict detection" });
    c.createEl("pre", { text: this.plan.body });
    c.createEl("h3", { text: "HakiSend server Markdown (read-only)" });
    c.createEl("pre", { text: this.remote.body });
    c.createEl("p", { text: "Compare both subjects and Markdown bodies. You may merge changes in your local note. Accepting the revision only advances its CAS base and marks it UNSAVED; it never writes to HakiSend. Use a separate explicit Save after review." });
    new import_obsidian.Setting(c).setName("I compared both versions and deliberately chose or merged my local content").addToggle((t) => t.setValue(false).onChange((v) => {
      this.acknowledged = v;
    }));
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Close without changes").onClick(() => this.close())).addButton((b) => b.setButtonText("Accept revision for NEXT manual save").onClick(async () => {
      if (!this.acknowledged || this.busy) {
        new import_obsidian.Notice("Review both versions and acknowledge first.");
        return;
      }
      this.busy = true;
      b.setDisabled(true);
      try {
        await this.acceptRevision();
        this.close();
        new import_obsidian.Notice("Only local revision metadata updated. No server write. Review the note before another manual Save.");
      } catch (e) {
        new import_obsidian.Notice("Could not accept the remote revision; verify both versions again.");
      } finally {
        this.busy = false;
        b.setDisabled(false);
      }
    }));
  }
  onClose() {
    this.contentEl.empty();
  }
};
var HakiSendReadOnlyCalendarModal = class extends import_obsidian.Modal {
  constructor(app, sites, loadCalendar) {
    super(app);
    this.sites = sites;
    this.loadCalendar = loadCalendar;
    this.siteUid = "";
    this.seq = 0;
  }
  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "HakiSend Unified Calendar \xB7 read-only" });
    c.createEl("p", { text: "Calendar shows server authoring state, NOT public visibility or send permission. The backend candidate is disabled until acceptance." });
    const view = c.createDiv();
    new import_obsidian.Setting(c).setName("Site").setDesc("Choose a Site, then manually refresh. No background polling.").addDropdown((d) => {
      d.addOption("", "Choose Site");
      for (const site of this.sites) d.addOption(site.uid, site.name);
      d.onChange((uid3) => {
        this.siteUid = uid3;
        this.seq++;
        view.empty();
      });
    });
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Load Calendar (GET only)").onClick(async () => {
      var _a, _b, _c, _d;
      if (!this.siteUid || !this.sites.some((s) => s.uid === this.siteUid)) {
        new import_obsidian.Notice("Choose a Site.");
        return;
      }
      const selected = this.siteUid;
      const seq = ++this.seq;
      view.empty();
      view.createEl("p", { text: "Reading server Calendar..." });
      try {
        const snapshot = await this.loadCalendar(selected);
        if (seq !== this.seq || selected !== this.siteUid) return;
        view.empty();
        const cal = snapshot.calendar;
        view.createEl("p", { text: "Timezone: " + cal.timezone + " \xB7 Server-confirmed records: " + cal.serverConfirmedCount + " \xB7 NOT send authorization." });
        if (snapshot.truncated) {
          view.createEl("p", { text: "Partial Calendar only: backend limit reached. Other events may exist." });
        }
        for (const day of cal.days) {
          view.createEl("h3", { text: day.localDate });
          const list = view.createEl("ul");
          for (const item of day.entries) {
            const display = item.effectiveAtUtcMs === null ? "time not confirmed" : new Date(item.effectiveAtUtcMs).toLocaleTimeString("en-GB", {
              timeZone: cal.timezone,
              hour: "2-digit",
              minute: "2-digit"
            });
            const visibility = item.kind === "post" ? " \xB7 authoring only / public visibility unverified" : "";
            list.createEl("li", { text: display + " \xB7 " + ((_a = item.title) != null ? _a : item.uid) + " \xB7 " + item.kind + " \xB7 " + item.status + visibility });
          }
        }
        view.createEl("h3", { text: "Unscheduled" });
        const unscheduled = view.createEl("ul");
        for (const item of cal.unscheduled) {
          unscheduled.createEl("li", { text: ((_b = item.title) != null ? _b : item.uid) + " \xB7 " + item.kind + " \xB7 " + item.status + " \xB7 no verified delivery time" });
        }
        view.createEl("h3", { text: "Blocked / unverified" });
        const blocked = view.createEl("ul");
        for (const item of cal.blocked) {
          blocked.createEl("li", { text: ((_c = item.title) != null ? _c : item.uid) + " \xB7 " + ((_d = item.blockedReason) != null ? _d : "not confirmed") + " \xB7 NOT scheduled" });
        }
        if (!cal.days.length && !cal.unscheduled.length && !cal.blocked.length) {
          view.createEl("p", { text: "No Calendar events returned for the chosen Site." });
        }
      } catch (e) {
        if (seq !== this.seq) return;
        view.empty();
        view.createEl("p", { text: "Server Calendar is unavailable or not yet enabled for this Site. No schedule was changed." });
      }
    }));
  }
  onClose() {
    this.seq++;
    this.contentEl.empty();
  }
};
var HakiSendPagedCalendarModal = class extends import_obsidian.Modal {
  constructor(app, sites, fetchPage) {
    super(app);
    this.sites = sites;
    this.fetchPage = fetchPage;
    this.siteUid = "";
    this.seq = 0;
    this.session = null;
    this.view = null;
  }
  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "HakiSend Calendar \xB7 paged read-only candidate" });
    c.createEl("p", { text: "Each page is loaded only when requested. Publication visibility and email delivery are not attested by this view." });
    new import_obsidian.Setting(c).setName("Site").setDesc("Select an authorized HakiSend Site.").addDropdown((d) => {
      d.addOption("", "Choose Site");
      for (const site of this.sites) d.addOption(site.uid, site.name);
      d.onChange((uid3) => {
        var _a;
        this.siteUid = uid3;
        this.seq++;
        this.session = null;
        (_a = this.view) == null ? void 0 : _a.empty();
      });
    });
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Load first page (GET)").onClick(async () => {
      await this.load(null);
    }));
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Load More (GET)").onClick(async () => {
      var _a;
      if (!((_a = this.session) == null ? void 0 : _a.nextCursor)) {
        new import_obsidian.Notice("No verified next page. Choose Load first page to refresh.");
        return;
      }
      await this.load(this.session.nextCursor);
    }));
    this.view = c.createDiv();
  }
  async load(cursor) {
    var _a, _b, _c, _d;
    if (!this.siteUid || !this.sites.some((s) => s.uid === this.siteUid)) {
      new import_obsidian.Notice("Choose a Site.");
      return;
    }
    const selected = this.siteUid;
    const previous = cursor === null ? null : this.session;
    if (cursor !== null && (!previous || previous.nextCursor !== cursor)) {
      new import_obsidian.Notice("Calendar continuation no longer matches the selected Site.");
      return;
    }
    const seq = ++this.seq;
    (_a = this.view) == null ? void 0 : _a.empty();
    (_b = this.view) == null ? void 0 : _b.createEl("p", { text: "Reading one verified server page..." });
    try {
      const payload = await this.fetchPage(selected, cursor);
      if (seq !== this.seq || selected !== this.siteUid) return;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const accepted = acceptCalendarPage(payload, selected, timezone, previous);
      this.session = accepted;
      this.render();
    } catch (e) {
      if (seq !== this.seq || selected !== this.siteUid) return;
      (_c = this.view) == null ? void 0 : _c.empty();
      (_d = this.view) == null ? void 0 : _d.createEl("p", { text: "Calendar page unavailable or unsafe. Previously verified pages remain in memory; nothing was changed on HakiSend." });
    }
  }
  render() {
    var _a, _b, _c, _d;
    const view = this.view;
    if (!view || !this.session) return;
    view.empty();
    const session = this.session;
    view.createEl("p", {
      text: "Pages loaded: " + session.pages.length + " \xB7 Records: " + session.seenIdentities.length + " \xB7 READ ONLY \xB7 No email send authorization."
    });
    if (session.nextCursor !== null) {
      view.createEl("p", { text: "More Calendar events may exist. Click Load More to request the next verified page." });
    } else {
      view.createEl("p", { text: "No further events in this bounded server traversal. Existing records may change; refresh to begin again." });
    }
    for (let index = 0; index < session.pages.length; index++) {
      const calendar = session.pages[index].calendar;
      view.createEl("h3", { text: "Page " + (index + 1) + " \xB7 " + calendar.timezone });
      for (const day of calendar.days) {
        view.createEl("p", { text: day.localDate + " \xB7 authoring schedule only" });
        const ul = view.createEl("ul");
        for (const event of day.entries) {
          ul.createEl("li", { text: ((_a = event.title) != null ? _a : event.uid) + " \xB7 " + event.kind + " \xB7 " + event.status + " \xB7 Public/send state unverified" });
        }
      }
      const unscheduled = view.createEl("ul");
      for (const event of calendar.unscheduled) {
        unscheduled.createEl("li", { text: ((_b = event.title) != null ? _b : event.uid) + " \xB7 " + event.kind + " \xB7 " + event.status + " \xB7 No confirmed delivery clock" });
      }
      for (const event of calendar.blocked) {
        unscheduled.createEl("li", { text: ((_c = event.title) != null ? _c : event.uid) + " \xB7 " + ((_d = event.blockedReason) != null ? _d : "unverified") + " \xB7 NOT scheduled" });
      }
    }
  }
  onClose() {
    this.seq++;
    this.session = null;
    this.view = null;
    this.contentEl.empty();
  }
};
// Native, read-only Website + Email month view. Server authority is never
// inferred from local plans or draft records. Missing Email API fails visibly.
function acceptNativeContentCalendar(payload, siteUid) {
  const data = payload?.data;
  if (payload?.success !== true || !data || data.contract_version !== "hks_publisher_calendar_browse_v1" ||
    data.site_uid !== siteUid || data.read_only !== true || data.send_authorized !== false ||
    data.schedule_authorized !== false || !Array.isArray(data.days) || data.days.length !== 42 ||
    typeof data.window_truncated !== "boolean") throw Error("Unverified native Calendar response.");
  const seenDates = new Set();
  const events = [];
  for (const day of data.days) {
    if (!day || typeof day.date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(day.date) ||
      !Array.isArray(day.items) || seenDates.has(day.date)) throw Error("Invalid Calendar day.");
    seenDates.add(day.date);
    for (const item of day.items) {
      if (!item || !["post", "email"].includes(item.kind) ||
        typeof item.uid !== "string" || !/^[A-Za-z0-9_-]{6,128}$/.test(item.uid) ||
        typeof item.title !== "string" || item.title.length > 512 ||
        typeof item.time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time) ||
        typeof item.state !== "string" || !/^[a-z_]{4,50}$/.test(item.state)) {
        throw Error("Invalid Calendar event.");
      }
      events.push({ siteUid, kind: item.kind, uid: item.uid, title: item.title,
        state: item.state, date: day.date, time: item.time, serverConfirmed: true });
      if (events.length > 450) throw Error("Calendar event limit exceeded.");
    }
  }
  return { events, truncated: data.window_truncated, incomplete: "" };
}
function nativeContentCalendarLabel(event) {
  const statuses = {
    post_planned: "Scheduled post",
    post_authoring_published: "Published in authoring",
    campaign_scheduled_native: "Scheduled email",
    campaign_queued_native: "Queued email",
    campaign_sending_native: "Sending email",
    campaign_done_native: "Sent in HakiSend"
  };
  return statuses[event.state] || "Check status in HakiSend";
}
var HakiSendNativeContentCalendarModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    const today = new Date();
    this.month = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    this.selectedDay = hksCalendarDay(today);
    this.siteFilter = plugin.settings.defaultSiteUid || "all";
    this.kindFilter = "all";
    this.rows = [];
    this.errors = [];
    this.localDocuments = [];
    this.loading = false;
    this.sequence = 0;
  }
  onOpen() {
    this.titleEl.setText("Lịch nội dung");
    // Reuse the responsive, wide Post Calendar modal shell. Without this the
    // native content view inherits Obsidian's narrow default dialog width.
    this.modalEl.addClass("hks-post-calendar-modal");
    this.render();
    void this.load();
  }
  async load() {
    const sequence = ++this.sequence;
    this.loading = true;
    this.rows = [];
    this.errors = [];
    this.render();
    const sites = this.siteFilter === "all" ? this.plugin.settings.sites :
      this.plugin.settings.sites.filter((site) => site.uid === this.siteFilter);
    const rows = [], errors = [];
    for (let i = 0; i < sites.length; i += 3) {
      const batch = await Promise.all(sites.slice(i, i + 3).map(async (site) => {
        try { return { site, result: await this.plugin.loadNativeContentCalendar(site.uid, this.month) }; }
        catch (error) { return { site, error: String(error).slice(0, 150) }; }
      }));
      if (sequence !== this.sequence) return;
      for (const item of batch) (item.error ? errors : rows).push(item);
    }
    if (sequence !== this.sequence) return;
    try {
      const files = this.app.vault.getMarkdownFiles()
        .filter((file) => file.path.startsWith("HakiSend Distribution Plans/"));
      if (files.length > 500) throw Error("Too many local plans to display.");
      const docs = [];
      for (const file of files) {
        if (file.stat.size > 18e5) continue;
        docs.push({ path: file.path, markdown: await this.app.vault.read(file) });
      }
      if (sequence !== this.sequence) return;
      this.localDocuments = docs;
    } catch (error) {
      errors.push({ site: { name: "Local plans" }, error: String(error).slice(0, 120) });
    }
    if (sequence !== this.sequence) return;
    this.rows = rows;
    this.errors = errors;
    this.loading = false;
    this.render();
  }
  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass("hks-post-calendar", "hks-native-content-calendar");
    // Mobile Obsidian expands every Setting control to a full-width row. Keep
    // filters and month navigation as explicit, accessible compact controls.
    const filters = root.createDiv({ cls: "hks-native-calendar-filters" });
    const siteLabel = filters.createEl("label", { cls: "hks-native-calendar-filter" });
    siteLabel.createEl("span", { text: "Trang web" });
    const siteSelect = siteLabel.createEl("select", { attr: { "aria-label": "Chọn trang web" } });
    siteSelect.createEl("option", { text: "Tất cả trang", attr: { value: "all" } });
    for (const site of this.plugin.settings.sites)
      siteSelect.createEl("option", { text: site.name, attr: { value: site.uid } });
    siteSelect.value = this.siteFilter;
    siteSelect.addEventListener("change", () => { this.siteFilter = siteSelect.value; void this.load(); });
    const kindLabel = filters.createEl("label", { cls: "hks-native-calendar-filter" });
    kindLabel.createEl("span", { text: "Nội dung" });
    const kindSelect = kindLabel.createEl("select", { attr: { "aria-label": "Lọc loại nội dung" } });
    for (const [value, text] of [["all", "Website + Email"], ["post", "Website"], ["email", "Email"]])
      kindSelect.createEl("option", { text, attr: { value } });
    kindSelect.value = this.kindFilter;
    kindSelect.addEventListener("change", () => { this.kindFilter = kindSelect.value; this.render(); });

    const nav = root.createDiv({ cls: "hks-native-calendar-nav" });
    const monthNav = nav.createDiv({ cls: "hks-native-calendar-month-nav" });
    const moveMonth = (offset) => {
      this.month = new Date(this.month.getFullYear(), this.month.getMonth() + offset, 1, 12);
      this.selectedDay = hksCalendarDay(this.month);
      void this.load();
    };
    const previous = monthNav.createEl("button", { cls: "hks-native-calendar-nav-button", text: "‹", attr: {
      type: "button", "aria-label": "Tháng trước", title: "Tháng trước" } });
    previous.addEventListener("click", () => moveMonth(-1));
    monthNav.createEl("h3", { cls: "hks-native-calendar-month", text:
      "Tháng " + (this.month.getMonth() + 1) + "/" + this.month.getFullYear() });
    const next = monthNav.createEl("button", { cls: "hks-native-calendar-nav-button", text: "›", attr: {
      type: "button", "aria-label": "Tháng sau", title: "Tháng sau" } });
    next.addEventListener("click", () => moveMonth(1));
    const actions = nav.createDiv({ cls: "hks-native-calendar-nav-actions" });
    const todayButton = actions.createEl("button", { text: "Hôm nay", attr: { type: "button" } });
    todayButton.addEventListener("click", () => {
      const today = new Date();
      this.month = new Date(today.getFullYear(), today.getMonth(), 1, 12);
      this.selectedDay = hksCalendarDay(today);
      void this.load();
    });
    const refreshButton = actions.createEl("button", { text: "Tải lại", attr: { type: "button" } });
    refreshButton.addEventListener("click", () => void this.load());
    if (this.loading) {
      root.createEl("p", { text: "Loading Calendar from HakiSend…" });
      return;
    }
    if (!this.plugin.settings.sites.length) root.createEl("p", { text: "Connect an authorized Site in HakiSend Publisher settings." });
    const missingEmail = this.rows.filter((row) =>
      typeof row.result.incomplete === "string" &&
      row.result.incomplete.startsWith("Email calendar unavailable"));
    if (missingEmail.length && this.kindFilter !== "post") {
      const status = root.createDiv({ cls: "hks-content-calendar-status" });
      status.createEl("strong", { text: "Email calendar isn't available yet." });
      status.createEl("span", { text: "Website dates are shown for " +
        missingEmail.length + " site" + (missingEmail.length === 1 ? "" : "s") + "." });
      const extra = status.createEl("details");
      extra.createEl("summary", { text: "Site details" });
      const sites = extra.createEl("ul");
      for (const row of missingEmail) sites.createEl("li", { text:
        row.site.name + ": " + row.result.incomplete });
    }
    const otherIncomplete = this.rows.filter((row) =>
      row.result.incomplete && !missingEmail.includes(row));
    const truncated = this.rows.filter((row) => row.result.truncated);
    if (this.errors.length || otherIncomplete.length || truncated.length) {
      const status = root.createDiv({ cls: "hks-content-calendar-status hks-content-calendar-error" });
      status.createEl("strong", { text: "Some calendar information could not be loaded." });
      const extra = status.createEl("details");
      extra.createEl("summary", { text: "View details" });
      const details = extra.createEl("ul");
      for (const row of this.errors) details.createEl("li", { text:
        row.site.name + ": " + row.error });
      for (const row of otherIncomplete) details.createEl("li", { text:
        row.site.name + ": " + row.result.incomplete });
      for (const row of truncated) details.createEl("li", { text:
        row.site.name + ": some events may be missing (results truncated)." });
    }
    const byDay = new Map();
    for (const row of this.rows) for (const event of row.result.events) {
      if (this.kindFilter !== "all" && event.kind !== this.kindFilter) continue;
      const list = byDay.get(event.date) || [];
      list.push({ ...event, site: row.site });
      byDay.set(event.date, list);
    }
    for (const list of byDay.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    const grid = root.createDiv({ cls: "hks-post-calendar-grid hks-native-calendar-grid" });
    for (const day of ["T2", "T3", "T4", "T5", "T6", "T7", "CN"])
      grid.createEl("div", { cls: "hks-post-calendar-weekday", text: day });
    const start = hksCalendarRange(this.month).start;
    const todayKey = hksCalendarDay(new Date());
    for (let i = 0; i < 42; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
      const key = hksCalendarDay(date);
      const items = byDay.get(key) || [];
      const classes = ["hks-post-calendar-day"];
      if (date.getMonth() !== this.month.getMonth()) classes.push("hks-post-calendar-outside");
      if (key === todayKey) classes.push("hks-post-calendar-today");
      if (key === this.selectedDay) classes.push("hks-post-calendar-selected");
      if (items.length) classes.push("hks-post-calendar-occupied");
      const cell = grid.createEl("button", { cls: classes.join(" ") + " hks-native-calendar-day", attr: {
        type: "button", "aria-pressed": String(key === this.selectedDay),
        "aria-label": key + ", " + items.length + " sự kiện" } });
      cell.createEl("strong", { text: String(date.getDate()) });
      for (const event of items.slice(0, 2)) cell.createEl("span", { cls: "hks-post-calendar-event", text:
        event.time + " · " + (event.kind === "email" ? "Email" : "Web") + " · " + event.title });
      if (items.length > 2) cell.createEl("span", { cls: "hks-post-calendar-more", text: "+" + (items.length - 2) + " more" });
      cell.addEventListener("click", () => { this.selectedDay = key; this.render(); });
    }
    const details = root.createDiv({ cls: "hks-post-calendar-details" });
    details.addClass("hks-native-calendar-details");
    details.createEl("h4", { text: "Nội dung ngày " + this.selectedDay.split("-").reverse().join("/") });
    const selected = byDay.get(this.selectedDay) || [];
    if (!selected.length) details.createEl("p", { text: "Ngày này chưa có nội dung trên HakiSend." });
    for (const event of selected) {
      const row = details.createDiv({ cls: "hks-native-calendar-event-row" });
      row.createEl("span", { cls: "hks-native-calendar-event-time", text: event.time });
      const body = row.createDiv({ cls: "hks-native-calendar-event-body" });
      body.createEl("span", { cls: "hks-native-calendar-event-kind", text: event.kind === "email" ? "Email" : "Website" });
      body.createEl("strong", { text: event.title });
      body.createEl("small", { text: event.site.name + " · " + nativeContentCalendarLabel(event) });
    }
    const local = r3LocalCalendar(this.localDocuments, this.siteFilter, "all");
    const plans = local.entries.filter((item) => item.kind !== "facebook_page_post" &&
      (this.kindFilter === "all" || this.kindFilter === "post" && item.kind === "site_post" ||
      this.kindFilter === "email" && ["post_free_email", "standalone_email"].includes(item.kind)));
    const localPanel = root.createEl("details", { cls: "hks-post-calendar-details hks-content-calendar-local" });
    localPanel.createEl("summary", { text: "Local drafts (" + plans.length + ")" });
    localPanel.createEl("p", { cls: "setting-item-description", text:
      "Saved in Obsidian only — not sent or published." });
    if (!plans.length) localPanel.createEl("p", { text: "No local plans for this filter." });
    for (const plan of plans.slice(0, 30)) {
      const action = localPanel.createEl("button", { cls: "hks-post-calendar-detail-action", text:
        plan.title + " · " + (plan.scheduledAtUtc || "No date") + " · LOCAL DRAFT" });
      action.addEventListener("click", async () => {
        const file = this.app.vault.getAbstractFileByPath(plan.planPath);
        if (file instanceof import_obsidian.TFile) await this.app.workspace.getLeaf(true).openFile(file);
      });
    }
    if (plans.length > 30) localPanel.createEl("p", { text: "Showing first 30 local plans. Open the plan folder to see the rest." });
  }
  onClose() {
    this.sequence++;
    this.contentEl.empty();
  }
};
// A single long-lived window controls the three Email Only stages. The
// existing server-verified save, promotion and delivery callbacks are reused;
// no remote mutation runs merely because this window opens or advances.
var HakiSendR3EmailWizardModal = class extends import_obsidian.Modal {
  constructor(app, plugin, filePath) {
    super(app);
    this.plugin = plugin;
    this.filePath = filePath;
    this.sequence = 0;
    this.closed = false;
    this.deliveryChild = null;
  }
  async onOpen() {
    this.titleEl.setText("HakiSend · Gửi email");
    await this.showCurrentStage();
  }
  async showCurrentStage() {
    if (this.closed) return;
    const request = ++this.sequence;
    const c = this.contentEl;
    c.empty();
    c.createEl("p", { text: "Đang kiểm tra trạng thái email..." });
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.path !== this.filePath || file.extension !== "md")
        throw Error("Hãy mở lại đúng email đang soạn rồi thử tiếp.");
      const raw = await this.app.vault.read(file);
      if (this.closed || request !== this.sequence) return;
      const cached = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      const fields = localEmailFieldsFromRaw(raw, cached);
      const plan = parseStandalonePlan(file, fields, raw);
      if (!this.plugin.settings.sites.some((site) => site.uid === plan.siteUid))
        throw Error("Trang web này chưa được cấp quyền trong HakiSend.");
      const siteName = this.plugin.settings.sites.find((site) => site.uid === plan.siteUid)?.name || "Trang web đã chọn";
      const hasDraft = !!plan.draftUid && !!plan.revision && fields.hakisend_remote_email_status === "private_draft";
      const campaign = typeof fields.hakisend_acelle_campaign_uid === "string" ? fields.hakisend_acelle_campaign_uid : "";
      const hasCampaign = hasDraft && /^[a-f0-9]{13}$/i.test(campaign) && fields.hakisend_acelle_campaign_status === "new_draft_not_sent";
      if (hasCampaign) {
        this.deliveryChild = this.plugin.createR3NativeDeliveryModal({
          site: plan.siteUid, campaign, notePath: file.path
        });
        this.deliveryChild.renderInto(c, true);
        return;
      }
      c.empty();
      c.createEl("h2", { text: "Gửi email với HakiSend" });
      c.createEl("p", { text: "Email: " + plan.subject + " · Trang web: " + siteName });
      c.createEl("p", { text: "① Lưu bản nháp   →   ② Chuẩn bị gửi   →   ③ Kiểm tra và gửi" });
      const action = (title, detail, label, callback) => {
        new import_obsidian.Setting(c).setName(title).setDesc(detail).addButton((button) => button.setButtonText(label).setCta().onClick(async () => {
          button.setDisabled(true);
          try {
            await callback();
          } catch (error) {
            new import_obsidian.Notice("Chưa thể tiếp tục: " + String(error).slice(0, 140));
          } finally {
            button.setDisabled(false);
          }
        }));
      };
      if (!hasDraft && !plan.requestUid && !plan.draftUid) {
        action("Bước 1/3 · Lưu bản nháp", "Chọn danh sách người nhận và lưu email. Chưa gửi ở bước này.", "Tiếp tục", () => this.plugin.openManualPrivateDraftSave(this));
      } else if (!hasDraft && !!plan.requestUid && !plan.draftUid) {
        action("Kiểm tra bản nháp", "HakiSend kiểm tra lại lần lưu trước để tránh tạo trùng.", "Kiểm tra lại", async () => {
          await this.plugin.recoverR3EmailOnlyPrivateDraft();
          await this.showCurrentStage();
        });
      } else if (hasDraft && !campaign && !fields.hakisend_acelle_promotion_request_uid) {
        action("Bước 2/3 · Chuẩn bị gửi", "Kiểm tra người gửi và chuẩn bị email để gửi. Chưa gửi ở bước này.", "Tiếp tục", () => this.plugin.openManualPrivateDraftPromotion(this));
      } else if (hasDraft && !hasCampaign && fields.hakisend_acelle_promotion_request_uid) {
        action("Kiểm tra email đã chuẩn bị", "Tìm lại kết quả lần trước để tránh tạo trùng chiến dịch.", "Kiểm tra lại", async () => {
          await this.plugin.recoverManualPrivatePromotion();
          await this.showCurrentStage();
        });
      } else {
        c.createEl("p", { text: "Email này không ở trạng thái có thể tiếp tục. Hãy kiểm tra trạng thái trong HakiSend để tránh gửi trùng." });
      }
      c.createEl("p", { text: "Chưa có email nào được gửi chỉ bằng việc mở cửa sổ này." });
    } catch (error) {
      if (this.closed || request !== this.sequence) return;
      c.empty();
      c.createEl("h2", { text: "Chưa thể tiếp tục gửi email" });
      c.createEl("p", { text: String(error).slice(0, 240) });
    }
  }
  onClose() {
    this.closed = true;
    this.sequence++;
    if (this.deliveryChild) this.deliveryChild.seq++;
    this.contentEl.empty();
  }
};
var HakiSendR3NativeDeliveryModal = class extends import_obsidian.Modal {
  constructor(app, sites, list, inspect, pending, submit, recover, pinned) {
    super(app);
    this.sites = sites;
    this.list = list;
    this.inspect = inspect;
    this.pending = pending;
    this.submit = submit;
    this.recover = recover;
    this.pinned = pinned;
    this.chosenSite = "";
    this.seq = 0;
  }
  onOpen() {
    this.renderInto(this.contentEl, false);
  }
  renderInto(root, autoInspect = false) {
    root.empty();
    root.createEl("h2", { text: "Bước 3/3 · Kiểm tra và gửi email" });
    root.createEl("p", { text: "HakiSend kiểm tra email và số người nhận trước khi bạn xác nhận gửi hoặc đặt lịch." });
    if (this.pinned) root.createEl("p", { text: "HakiSend sẽ kiểm tra đúng email vừa chuẩn bị và danh sách người nhận đã chọn." });
    const area = root.createDiv();
    if (this.pinned) {
      const { site, campaign: campaign2 } = this.pinned;
      if (!this.sites.some((x) => x.uid === site)) {
        area.createEl("p", { text: "Trang web này chưa được cấp quyền. Hãy kết nối lại HakiSend." });
        return;
      }
      this.chosenSite = site;
      const inspectThisCampaign = async () => {
        const seq = ++this.seq;
        area.empty();
        area.createEl("p", { text: "Đang kiểm tra email và người nhận..." });
        try {
          const check = await this.inspect(site, campaign2);
          if (seq !== this.seq) return;
          area.empty();
          const required2 = [
            "site_audience",
            "native_state",
            "source_content_integrity",
            "membership_guest_free_attestation",
            "campaign_permission",
            "native_setup",
            "sender",
            "unsubscribe",
            "native_recipient_count",
            "credit"
          ];
          const count = check.recipientCount;
          if (check.siteUid !== site || check.campaign.uid !== campaign2) {
            area.createEl("p", { text: "Thông tin email không khớp. HakiSend đã dừng thao tác để bảo vệ bạn." });
            new import_obsidian.Setting(area).addButton((button) => button.setButtonText("Kiểm tra lại").onClick(inspectThisCampaign));
            return;
          }
          area.createEl("p", { text: "Email: " + check.campaign.name + " · Số người nhận hợp lệ: " + String(count) });
          // The server's complete preflight still gates the operation. Its
          // internal check names belong in the advanced inspector, not in the
          // ordinary Email Only send/approval flow on mobile.
          const allowed = check.campaign.status === "new" && count !== null && count > 0 && required2.every((key) => {
            var _a;
            return ((_a = check.checks[key]) == null ? void 0 : _a.state) === "pass";
          });
          const existing = this.pending(site, campaign2);
          if (existing) {
            area.createEl("p", { text: "Email này đã có yêu cầu gửi trước đó. Hãy kiểm tra kết quả; không gửi lần nữa." });
            new import_obsidian.Setting(area).addButton((b2) => b2.setButtonText("Kiểm tra kết quả cũ").onClick(async () => {
              try {
                const rec = await this.recover(existing);
                new import_obsidian.Notice("Trạng thái xử lý: " + rec.journalStatus + ".");
              } catch (e) {
                new import_obsidian.Notice("Chưa đọc được kết quả cũ. Không bấm gửi thêm; hãy kiểm tra trong HakiSend.");
              }
            }));
            return;
          }
          if (!allowed) {
            area.createEl("strong", { text: "Email chưa đủ điều kiện gửi. Vui lòng xử lý các mục sau rồi kiểm tra lại." });
            const help = {
              site_audience: "Kiểm tra trang web và danh sách người nhận.",
              native_state: "Email không còn ở trạng thái có thể gửi. Hãy kiểm tra trong HakiSend.",
              source_content_integrity: "Nội dung email đã thay đổi. Hãy chuẩn bị email lại trước khi gửi.",
              membership_guest_free_attestation: "Cần xác minh quyền truy cập nội dung trong HakiSend.",
              campaign_permission: "Tài khoản chưa được cấp quyền gửi email này.",
              native_setup: "Cần hoàn tất cấu hình email và người nhận trong HakiSend.",
              sender: "Địa chỉ người gửi chưa được xác minh.",
              unsubscribe: "Email còn thiếu thông tin hủy đăng ký bắt buộc.",
              native_recipient_count: "Danh sách chưa có người nhận hợp lệ.",
              credit: "Hãy kiểm tra hạn mức gửi email."
            };
            const problems = new Set();
            if (check.campaign.status !== "new") problems.add(help.native_state);
            if (count === null || count <= 0) problems.add(help.native_recipient_count);
            for (const key of required2) {
              const status = check.checks[key];
              if (status?.state !== "pass") problems.add(help[key]);
            }
            for (const problem of problems) area.createEl("p", { text: "• " + problem });
            new import_obsidian.Setting(area).addButton((button) => button.setButtonText("Kiểm tra lại").onClick(inspectThisCampaign));
            return;
          }
          if (!check.deliveryAccess?.sendNow && !check.deliveryAccess?.schedule) {
            area.createEl("p", { text: "HakiSend chưa bật tính năng gửi email. Bản nháp vẫn an toàn; quản trị viên cần bật quyền gửi trên máy chủ rồi nhấn Kiểm tra lại." });
            new import_obsidian.Setting(area).addButton((button) => button.setButtonText("Kiểm tra lại").onClick(inspectThisCampaign));
            return;
          }
          area.createEl("p", { text: "Các điều kiện gửi đã đạt. Bạn có thể chọn gửi ngay hoặc đặt lịch." });
          this.renderConfirmation(area, site, campaign2, count, check.deliveryAccess);
        } catch (e) {
          if (seq !== this.seq) return;
          area.empty();
          area.createEl("p", { text: "Chưa kiểm tra được email. Chưa có thao tác gửi nào được thực hiện." });
          new import_obsidian.Setting(area).addButton((button) => button.setButtonText("Kiểm tra lại").onClick(inspectThisCampaign));
        }
      };
      if (autoInspect) {
        void inspectThisCampaign();
      } else {
        new import_obsidian.Setting(root).addButton((b) => b.setButtonText("Kiểm tra email trước khi gửi").setCta().onClick(inspectThisCampaign));
      }
      return;
    }
    new import_obsidian.Setting(root).setName("HakiSend Site").addDropdown((drop) => {
      drop.addOption("", "Choose Site");
      for (const site of this.sites) drop.addOption(site.uid, site.name);
      drop.onChange((value) => {
        this.chosenSite = value;
        this.seq++;
        area.empty();
      });
    });
    new import_obsidian.Setting(root).addButton((btn) => btn.setButtonText("Load Campaigns (read-only)").onClick(async () => {
      const site = this.chosenSite;
      if (!site || !this.sites.some((s) => s.uid === site)) {
        new import_obsidian.Notice("Choose a Site.");
        return;
      }
      const seq = ++this.seq;
      area.empty();
      area.createEl("p", { text: "Loading\u2026" });
      try {
        const result = await this.list(site);
        if (seq !== this.seq || site !== this.chosenSite) return;
        area.empty();
        const eligible = result.campaigns.filter((x) => x.status === "new");
        if (!eligible.length) {
          area.createEl("p", { text: "No eligible NEW Campaigns for this Site." });
          return;
        }
        const dropdown = area.createEl("select");
        for (const row of eligible) {
          const option = dropdown.createEl("option");
          option.value = row.uid;
          option.text = row.name;
        }
        const detail = area.createDiv();
        new import_obsidian.Setting(area).addButton((btn2) => btn2.setButtonText("Inspect native preflight").onClick(async () => {
          const campaign2 = dropdown.value;
          detail.empty();
          detail.createEl("p", { text: "Checking\u2026" });
          try {
            const check = await this.inspect(site, campaign2);
            if (seq !== this.seq || site !== this.chosenSite || campaign2 !== dropdown.value) return;
            detail.empty();
            const required2 = [
              "site_audience",
              "native_state",
              "source_content_integrity",
              "membership_guest_free_attestation",
              "campaign_permission",
              "native_setup",
              "sender",
              "unsubscribe",
              "native_recipient_count",
              "credit"
            ];
            const count = check.recipientCount;
            const allowed = check.campaign.status === "new" && count !== null && count > 0 && required2.every((key) => {
              var _a;
              return ((_a = check.checks[key]) == null ? void 0 : _a.state) === "pass";
            });
            detail.createEl("p", { text: check.campaign.name + " \xB7 " + check.campaign.status + " \xB7 " + String(count) + " eligible recipients" });
            for (const [key, value] of Object.entries(check.checks)) {
              detail.createEl("p", { text: key + " \xB7 " + value.state + " \xB7 " + value.detail });
            }
            if (!allowed || !check.deliveryAccess?.sendNow && !check.deliveryAccess?.schedule) {
              detail.createEl("strong", { text: "BLOCKED. Correct HakiSend native preflight first." });
              return;
            }
            const exists = this.pending(site, campaign2);
            if (exists) {
              detail.createEl("p", { text: "An approval request has already been persisted for this Campaign. Recovery is GET only." });
              new import_obsidian.Setting(detail).addButton((b) => b.setButtonText("Recover previous receipt").onClick(async () => {
                try {
                  const receipt2 = await this.recover(exists);
                  new import_obsidian.Notice("Journal: " + receipt2.journalStatus + " \u2014 not Inbox proof");
                } catch (e) {
                  new import_obsidian.Notice("Receipt requires operator reconciliation. Do not send again.");
                }
              }));
              return;
            }
            this.renderConfirmation(detail, site, campaign2, count, check.deliveryAccess);
          } catch (e) {
            detail.empty();
            detail.createEl("p", { text: String(e) });
          }
        }));
      } catch (e) {
        if (seq !== this.seq) return;
        area.empty();
        area.createEl("p", { text: String(e) });
      }
    }));
  }
  renderConfirmation(root, site, campaign2, count, access = { sendNow: false, schedule: false }) {
    if (!access.sendNow && !access.schedule) {
      root.createEl("p", { text: "Máy chủ chưa mở quyền gửi cho email này." });
      return;
    }
    let action = access.sendNow ? "send_now" : "schedule";
    let timezone = "Asia/Ho_Chi_Minh";
    let date, time2;
    const actionContainer = root.createDiv();
    const calendar = root.createDiv();
    root.createEl("p", { text: "HakiSend tự kiểm tra trạng thái đăng ký trong danh sách người nhận trước khi gửi." });
    const summary = root.createDiv();
    const feedback = root.createDiv();
    const confirmContainer = root.createDiv({ cls: "hakisend-email-confirm" });
    let submitted = false;
    let accepted = false;
    let confirmButton = null;
    const renderSummary = () => {
      summary.empty();
      if (confirmButton && !submitted) confirmButton.setButtonText((action === "schedule" ? "Xác nhận đặt lịch cho " : "Xác nhận gửi cho ") + count + " người");
      const details = action === "schedule"
        ? date?.value && time2?.value ? "Đặt lịch: " + date.value + " lúc " + time2.value + " (" + timezone + ")" : "Hãy chọn ngày và giờ gửi."
        : "Gửi ngay sau khi xác nhận.";
      summary.createEl("p", { text: "Số người nhận: " + count + " · " + details });
    };
    const renderTime = () => {
      calendar.empty();
      date = void 0;
      time2 = void 0;
      if (action === "schedule") {
        calendar.createEl("p", { text: "Chọn ngày và giờ gửi (muộn hơn hiện tại ít nhất 15 phút)." });
        const inputs = calendar.createDiv({ cls: "hakisend-email-schedule-fields" });
        const dateLabel = inputs.createEl("label", { cls: "hakisend-email-schedule-field" });
        dateLabel.createEl("span", { text: "Ngày gửi" });
        date = dateLabel.createEl("input", { attr: { type: "date", "aria-label": "Ngày gửi" } });
        const timeLabel = inputs.createEl("label", { cls: "hakisend-email-schedule-field" });
        timeLabel.createEl("span", { text: "Giờ gửi" });
        time2 = timeLabel.createEl("input", { attr: { type: "time", "aria-label": "Giờ gửi" } });
        date.addEventListener("change", renderSummary);
        time2.addEventListener("change", renderSummary);
        new import_obsidian.Setting(calendar).setName("Múi giờ").addDropdown((d) => {
          for (const z of ["Asia/Ho_Chi_Minh", "UTC", "America/New_York", "Europe/London"]) d.addOption(z, z);
          d.onChange((z) => {
            timezone = z;
            renderSummary();
          });
        });
      }
      renderSummary();
    };
    new import_obsidian.Setting(actionContainer).setName("Khi nào gửi?").addDropdown((d) => {
      if (access.sendNow) d.addOption("send_now", "Gửi ngay");
      if (access.schedule) d.addOption("schedule", "Đặt lịch gửi");
      d.onChange((v) => {
        if (submitted) return;
        action = v;
        renderTime();
      });
    });
    renderTime();
    new import_obsidian.Setting(confirmContainer).addButton((btn) => {
      confirmButton = btn;
      btn.setButtonText((action === "schedule" ? "Xác nhận đặt lịch cho " : "Xác nhận gửi cho ") + count + " người").setCta().onClick(async () => {
      if (submitted) {
        // The server already accepted this immutable request. A second click
        // may dismiss the dialog, but must never call submit again.
        if (accepted) this.close();
        return;
      }
      const approvedAction = action, approvedZone = timezone;
      const approvedDate = action === "schedule" ? date == null ? void 0 : date.value : void 0;
      const approvedTime = action === "schedule" ? time2 == null ? void 0 : time2.value : void 0;
      if (approvedAction === "schedule" && (!approvedDate || !approvedTime)) {
        feedback.empty();
        feedback.createEl("p", { text: "Hãy chọn đủ ngày và giờ gửi." });
        return;
      }
      submitted = true;
      btn.setDisabled(true);
      btn.setButtonText("Đang xử lý yêu cầu...");
      feedback.empty();
      const payload = {
        request_uid: crypto.randomUUID(),
        recipient_count_snapshot: count,
        approval_confirmed: true,
        ...approvedAction === "schedule" ? { delivery_date: approvedDate, delivery_time: approvedTime, timezone: approvedZone } : {}
      };
      try {
        const result = await this.submit(site, campaign2, approvedAction, payload);
        accepted = true;
        btn.setButtonText(result.journalStatus === "scheduled" ? "Đã đặt lịch gửi" : "Đã tiếp nhận yêu cầu");
        btn.setDisabled(false);
        feedback.createEl("p", { text: result.journalStatus === "scheduled"
          ? "HakiSend đã xác nhận lịch gửi. Trạng thái sẽ được cập nhật trong ghi chú khi HakiSend xử lý tiếp."
          : "HakiSend đã tiếp nhận email để xử lý. Trạng thái sẽ được cập nhật trong ghi chú; đây chưa phải xác nhận thư đến hộp thư." });
      } catch (e) {
        btn.setButtonText("Cần kiểm tra kết quả");
        feedback.createEl("p", { text: "Chưa xác định được kết quả. Không bấm gửi lại. Hãy kiểm tra lịch sử trong HakiSend. " + String(e) });
        const prior = {
          siteUid: site,
          campaignUid: campaign2,
          requestUid: payload.request_uid,
          action: approvedAction
        };
        new import_obsidian.Setting(feedback).addButton((checkButton) => checkButton
          .setButtonText("Check existing request (read-only)")
          .onClick(async () => {
            checkButton.setDisabled(true);
            try {
              const recovered = await this.recover(prior);
              feedback.createEl("p", { text: "HakiSend receipt: " + recovered.journalStatus + ". This is not inbox delivery proof." });
            } catch (error) {
              feedback.createEl("p", { text: "Chưa đọc được receipt cho yêu cầu cũ. Không gửi lại; hãy đối chiếu trên HakiSend." });
            } finally {
              checkButton.setDisabled(false);
            }
          }));
      }
      });
    });
  }
  onClose() {
    this.seq++;
    this.contentEl.empty();
  }
};
var HakiSendR3MultichannelPlanModal = class extends import_obsidian.Modal {
  constructor(app, sites, defaultSite, fetchAudiences) {
    var _a, _b, _c, _d;
    super(app);
    this.sites = sites;
    this.fetchAudiences = fetchAudiences;
    this.selectedSite = "";
    this.mode = "post";
    this.title = "";
    this.postTime = "";
    this.lists = [];
    this.pages = [];
    this.audiences = [];
    this.running = false;
    this.siteRevision = 0;
    const note = app.workspace.getActiveFile();
    const front = note ? (_a = app.metadataCache.getFileCache(note)) == null ? void 0 : _a.frontmatter : {};
    const pinned = typeof (front == null ? void 0 : front.site_uid) === "string" ? front.site_uid : "";
    this.selectedSite = sites.some((s) => s.uid === pinned) ? pinned : sites.some((s) => s.uid === defaultSite) ? defaultSite : (_c = (_b = sites[0]) == null ? void 0 : _b.uid) != null ? _c : "";
    this.title = (_d = note == null ? void 0 : note.basename) != null ? _d : "";
  }
  onOpen() {
    const c = this.contentEl;
    c.empty();
    c.createEl("h2", { text: "HakiSend \u2014 Website & Email Plan (R3)" });
    c.createEl("p", { text: "Plan Website, Post Free Email or Standalone Email. Only creates a local review note; nothing is sent or scheduled." });
    const note = this.app.workspace.getActiveFile();
    if (!note || note.extension !== "md" || !this.sites.length) {
      c.createEl("p", { text: "Open an editable Markdown note and connect at least one HakiSend Site." });
      return;
    }
    new import_obsidian.Setting(c).setName("Mode").addDropdown((d) => d.addOption("post", "Website Post + optional Free Email").addOption("email_only", "Email Only \u2014 all Markdown, no Website Post").setValue(this.mode).onChange((v) => {
      this.mode = v;
      if (this.mode === "email_only") {
        this.pages = [];
        this.postTime = "";
      }
      this.renderConditional();
    }));
    new import_obsidian.Setting(c).setName("Site (owner)").setDesc("Email Only uses the Site for ownership; it does not create a Website Post.").addDropdown((d) => {
      for (const site of this.sites) d.addOption(site.uid, site.name);
      d.setValue(this.selectedSite);
      d.onChange((v) => {
        this.selectedSite = v;
        this.audiences = [];
        this.lists = [];
        this.siteRevision++;
        this.renderConditional();
      });
    });
    new import_obsidian.Setting(c).setName("Title").addText((t) => t.setValue(this.title).onChange((v) => {
      this.title = v;
    }));
    const options = c.createDiv();
    const audiences = c.createDiv();
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Create local distribution plan").setCta().onClick(async () => {
      var _a, _b;
      if (this.running) return;
      this.running = true;
      b.setDisabled(true);
      try {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.path !== note.path || file.extension !== "md")
          throw Error("Source note changed. Reopen Distribution Plan.");
        const fm = (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {};
        if (fm.hakisend_import_snapshot === true || fm.hakisend_read_only === true)
          throw Error("Read-only import cannot be a distribution source.");
        if (this.mode === "post" && typeof fm.site_uid === "string" && fm.site_uid !== this.selectedSite)
          throw Error("Post pinned Site changed. Use the Post's Site or edit its metadata first.");
        const input = {
          mode: this.mode,
          siteUid: this.selectedSite,
          notePath: file.path,
          title: this.title,
          markdown: await this.app.vault.read(file),
          postScheduledAt: this.postTime || void 0,
          lists: this.lists.map((x) => ({ ...x })),
          pages: []
        };
        const plan = createR3LocalPlan(input);
        const root = "HakiSend Distribution Plans";
        const folder = root + "/" + plan.siteUid;
        if (!this.app.vault.getAbstractFileByPath(root)) await this.app.vault.createFolder(root);
        if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
        const created = await this.app.vault.create(folder + "/" + uuidV4() + ".md", renderR3LocalPlan(plan));
        this.close();
        await this.app.workspace.getLeaf(true).openFile(created);
        new import_obsidian.Notice("Multichannel plan created locally. Nothing published, emailed or scheduled.");
      } catch (err) {
        new import_obsidian.Notice("Plan blocked: " + (err instanceof Error ? err.message : "unknown").slice(0, 180));
      } finally {
        this.running = false;
        b.setDisabled(false);
      }
    }));
    this.renderInto(options, audiences);
  }
  renderConditional() {
    const c = this.contentEl.querySelector("[data-r3-options]");
    const a = this.contentEl.querySelector("[data-r3-audiences]");
    if (c && a) this.renderInto(c, a);
  }
  renderInto(options, audiences) {
    options.setAttribute("data-r3-options", "1");
    audiences.setAttribute("data-r3-audiences", "1");
    options.empty();
    audiences.empty();
    if (this.mode === "post") {
      new import_obsidian.Setting(options).setName("Website publication time").setDesc("Optional ISO 8601 with explicit offset; independent of email time.").addText((t) => t.setPlaceholder("2026-11-04T08:00:00+07:00").setValue(this.postTime).onChange((v) => {
        this.postTime = v;
      }));
      options.createEl("p", { text: "Post Free Email requires <!-- hakisend:free:start --> and <!-- hakisend:free:end --> in the source Markdown; the backend must still attest guest-visible content." });
    } else {
      options.createEl("p", { text: "Email Only takes the complete Markdown body (excluding YAML properties). It creates no Website Post." });
    }
    const revision = this.siteRevision;
    new import_obsidian.Setting(audiences).setName("Email Lists for selected Site").addButton((b) => b.setButtonText("Load authorized Lists").onClick(async () => {
      b.setDisabled(true);
      try {
        const rows = await this.fetchAudiences(this.selectedSite);
        if (revision !== this.siteRevision) return;
        if (!Array.isArray(rows) || rows.length > 500 || !rows.every(isAudience))
          throw Error("Invalid HakiSend List response");
        this.audiences = rows;
        this.renderConditional();
      } catch (e) {
        new import_obsidian.Notice("List lookup unavailable: " + String(e).slice(0, 150));
      } finally {
        b.setDisabled(false);
      }
    }));
    new import_obsidian.Setting(audiences).setName("Chỉ một Email List cho mỗi Plan").setDesc("Muốn gửi đến List khác, hãy tạo Plan riêng. Các Plan cũ không bị sửa.").addButton((b) => b.setButtonText("Chọn Email List").setDisabled(!this.audiences.length || this.lists.length >= 1).onClick(() => {
      if (!this.audiences.length || this.lists.length >= 1) return;
      this.lists.push({
        listUid: this.audiences[0].uid,
        templateRef: "",
        subject: this.title,
        scheduledAt: ""
      });
      this.renderConditional();
    }));
    for (let i = 0; i < this.lists.length; i++) {
      const item = this.lists[i], row = audiences.createDiv();
      new import_obsidian.Setting(row).setName("Email List #" + (i + 1)).addDropdown((d) => {
        for (const a of this.audiences) d.addOption(a.uid, a.name);
        d.setValue(item.listUid);
        d.onChange((v) => {
          item.listUid = v;
        });
      }).addButton((b) => b.setIcon("trash").onClick(() => {
        this.lists.splice(i, 1);
        this.renderConditional();
      }));
      new import_obsidian.Setting(row).setName("Template reference (backend verification required)").addText((t) => t.setPlaceholder("Template UID or reference").setValue(item.templateRef).onChange((v) => {
        item.templateRef = v;
      }));
      new import_obsidian.Setting(row).setName("Email subject").addText((t) => t.setValue(item.subject).onChange((v) => {
        item.subject = v;
      }));
      new import_obsidian.Setting(row).setName("Preview text").addText((t) => {
        var _a;
        return t.setValue((_a = item.preheader) != null ? _a : "").onChange((v) => {
          item.preheader = v;
        });
      });
      new import_obsidian.Setting(row).setName("Independent send time").addText((t) => {
        var _a;
        return t.setPlaceholder("2026-11-05T09:00:00+07:00").setValue((_a = item.scheduledAt) != null ? _a : "").onChange((v) => {
          item.scheduledAt = v;
        });
      });
    }
    if (this.mode === "email_only" && !this.lists.length)
      audiences.createEl("p", { text: "Email Only requires at least one selected authorized List." });
  }
  onClose() {
    this.siteRevision++;
    this.contentEl.empty();
  }
};
var HakiSendR3LocalMultichannelCalendarModal = class extends import_obsidian.Modal {
  constructor(app, sites) {
    super(app);
    this.sites = sites;
    this.chosenSite = "all";
    this.chosenKind = "all";
    this.documents = [];
    this.panel = null;
  }
  onOpen() {
    const root = this.contentEl;
    root.empty();
    root.createEl("h2", { text: "HakiSend \u2014 Website & Email Plan Calendar (LOCAL ONLY)" });
    root.createEl("p", { text: "This displays future INTENTS in your Vault, not confirmed HakiSend schedules. Never treat a local draft as sent or published." });
    new import_obsidian.Setting(root).setName("Site").addDropdown((d) => {
      d.addOption("all", "All authorized Sites");
      for (const site of this.sites) d.addOption(site.uid, site.name);
      d.onChange((v) => {
        this.chosenSite = v;
        this.renderEntries();
      });
    });
    new import_obsidian.Setting(root).setName("Content type").addDropdown((d) => {
      for (const [value, name] of [
        ["all", "All"],
        ["site_post", "Website Post"],
        ["post_free_email", "Post Free Email"],
        ["standalone_email", "Standalone Email"]
      ]) d.addOption(value, name);
      d.onChange((v) => {
        this.chosenKind = v;
        this.renderEntries();
      });
    });
    new import_obsidian.Setting(root).addButton((b) => b.setButtonText("Refresh local plans").onClick(async () => {
      b.setDisabled(true);
      try {
        await this.loadPlans();
      } catch (e) {
        new import_obsidian.Notice("Local Calendar read failed: " + String(e).slice(0, 120));
      } finally {
        b.setDisabled(false);
      }
    }));
    this.panel = root.createDiv();
    void this.loadPlans().catch((e) => {
      new import_obsidian.Notice("Local plan read failed: " + String(e).slice(0, 120));
    });
  }
  async loadPlans() {
    const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith("HakiSend Distribution Plans/"));
    if (files.length > 500) throw Error("Over 500 plan notes; narrow the local dataset.");
    const data2 = [];
    for (const file of files) {
      if (file.stat.size > 18e5) {
        data2.push({ path: file.path, markdown: "INVALID_OVERSIZED_PLAN" });
        continue;
      }
      data2.push({ path: file.path, markdown: await this.app.vault.read(file) });
    }
    this.documents = data2;
    this.renderEntries();
  }
  renderEntries() {
    var _a, _b;
    const root = this.panel;
    if (!root) return;
    root.empty();
    const rawCal = r3LocalCalendar(this.documents, this.chosenSite, this.chosenKind);
    const cal = { ...rawCal, entries: rawCal.entries.filter((e) => e.kind !== "facebook_page_post") };
    root.createEl("p", { text: cal.entries.length + " local planned actions \xB7 " + cal.invalidDocuments + " invalid/unsupported plans. All statuses are LOCAL DRAFT." });
    if (!cal.entries.length) {
      root.createEl("p", { text: "No local plans match the Site/type filter." });
      return;
    }
    for (const e of cal.entries) {
      const site = this.sites.find((s) => s.uid === e.siteUid);
      const source = e.planPath;
      new import_obsidian.Setting(root).setName(e.title).setDesc(((_a = site == null ? void 0 : site.name) != null ? _a : e.siteUid) + " \xB7 " + e.kind.replace(/_/g, " ") + " \xB7 " + e.destinationLabel + " \xB7 " + ((_b = e.scheduledAtUtc) != null ? _b : "No date set") + " \xB7 LOCAL DRAFT").addButton((b) => b.setButtonText("Open plan").onClick(async () => {
        const file = this.app.vault.getAbstractFileByPath(source);
        if (!(file instanceof import_obsidian.TFile)) throw Error("Local plan no longer exists.");
        await this.app.workspace.getLeaf(true).openFile(file);
      }));
    }
  }
  onClose() {
    this.panel = null;
    this.documents = [];
    this.contentEl.empty();
  }
};
// Cloud Sync v1: only HakiSend-owned Email notes. Sync never sends or promotes.
var CLOUD_SYNC_CONTRACT = "hakisend_cloud_email_sync_v1";
var CLOUD_SYNC_UID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
var CLOUD_SYNC_CAMPAIGN = /^[0-9a-f]{13}$/i;
function cloudSyncKey(site, uid3) {
  if (!CLOUD_SYNC_UID.test(site) || !CLOUD_SYNC_UID.test(uid3)) throw Error("Invalid Cloud Sync identity.");
  return site.toLowerCase() + ":" + uid3.toLowerCase();
}
function cloudSyncUrl(origin, site, path) {
  if (!CLOUD_SYNC_UID.test(site) || !/^(?:emails(?:\/[0-9a-f-]{36})?)(?:\?after_id=\d+&limit=\d+)?$/i.test(path)) throw Error("Invalid Cloud Sync path.");
  const normalized = normalizeBaseUrl(origin);
  const base = new URL(normalized);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash ||
    base.pathname !== "/" && base.pathname !== "") throw Error("Cloud Sync requires a secure HakiSend HTTPS origin.");
  return normalized + "/api/v1/hakisend/sites/" + site.toLowerCase() + "/publisher/sync/" + path;
}
async function cloudSyncApi(origin, site, token, path, method = "GET", body) {
  if (method !== "GET" && method !== "PUT") throw Error("Unsupported Cloud Sync operation.");
  if (!token || /[\r\n]/.test(token)) throw Error("Secure HakiSend OAuth required.");
  if (method === "GET" && body !== void 0 || method === "PUT" && !body) throw Error("Invalid Cloud Sync body.");
  const response = await (0, import_obsidian.requestUrl)({
    url: cloudSyncUrl(origin, site, path),
    method,
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + token,
      ...body ? { "Content-Type": "application/json" } : {}
    },
    ...body ? { body: JSON.stringify(body) } : {},
    throw: false
  });
  if (!response || response.status < 200 || response.status >= 300 || response.json?.success !== true || !response.json.data) {
    const err = Error("Cloud Sync HTTP " + (response?.status ?? 0) + " (" + method + "); no automatic retry.");
    err.status = response?.status ?? 0;
    throw err;
  }
  return response.json.data;
}
function cloudSyncValidateDocument(doc, expectedSite, expectedUid = "", requireBody = true) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || !CLOUD_SYNC_UID.test(doc.uid) ||
    !CLOUD_SYNC_UID.test(doc.site_uid) || doc.site_uid.toLowerCase() !== expectedSite.toLowerCase() ||
    expectedUid && doc.uid.toLowerCase() !== expectedUid.toLowerCase() ||
    !Number.isSafeInteger(doc.revision) || doc.revision < 1 ||
    typeof doc.subject !== "string" || !doc.subject.trim() || doc.subject.length > 255 || /[\r\n\0]/.test(doc.subject) ||
    typeof doc.preheader !== "string" || doc.preheader.length > 255 || /[\r\n\0]/.test(doc.preheader) ||
    typeof doc.list_uid !== "string" || doc.list_uid.length > 191 ||
    typeof doc.editable !== "boolean" || (doc.promotion_status !== null && typeof doc.promotion_status !== "string") ||
    (doc.campaign_uid !== null && (!CLOUD_SYNC_CAMPAIGN.test(doc.campaign_uid) || doc.editable)) ||
    (doc.campaign_status !== null && typeof doc.campaign_status !== "string") ||
    (doc.approval_status !== null && typeof doc.approval_status !== "string")) throw Error("Unverified Cloud Sync Email identity or metadata.");
  if (requireBody && (typeof doc.body_markdown !== "string" || !doc.body_markdown.trim() ||
    new TextEncoder().encode(doc.body_markdown).length > 2e5 || doc.body_markdown.includes("\0"))) throw Error("Unverified Cloud Sync Email content.");
  if (doc.promotion_status !== null && doc.editable) throw Error("Promoted email cannot be editable.");
  return doc;
}
function cloudSyncValidatePage(data2, site) {
  if (!data2 || data2.contract_version !== CLOUD_SYNC_CONTRACT || data2.site_uid !== site ||
    !Array.isArray(data2.items) || data2.items.length > 50 || data2.read_only !== true ||
    data2.next_after_id !== null && (!Number.isSafeInteger(data2.next_after_id) || data2.next_after_id < 1)) {
    throw Error("Invalid Cloud Sync page contract.");
  }
  const seen = new Set();
  for (const doc of data2.items) {
    cloudSyncValidateDocument(doc, site, "", false);
    if (seen.has(doc.uid)) throw Error("Duplicate Cloud Sync Email identity.");
    seen.add(doc.uid);
  }
  return data2;
}
function cloudSyncValidateDetail(data2, site, uid3) {
  if (!data2 || data2.contract_version !== CLOUD_SYNC_CONTRACT)
    throw Error("Invalid Cloud Sync detail contract.");
  return cloudSyncValidateDocument(data2.document, site, uid3, true);
}
function cloudSyncContent(doc) {
  const body = doc.body_markdown ?? doc.body;
  return { subject: doc.subject.trim(), preheader: doc.preheader || "", body: typeof body === "string" ? body.trim() : "" };
}
async function cloudSyncHash(doc) {
  const value = cloudSyncContent(doc);
  return await sha256Base64Url(JSON.stringify([value.subject, value.preheader, value.body]));
}
function cloudSyncUpsertYaml(raw, updates) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match) throw Error("Cloud Sync requires intact YAML properties.");
  const lines = match[1].split(/\r?\n/);
  for (const [key, value] of Object.entries(updates)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw Error("Invalid sync property.");
    const at = lines.map((line, i) => line.startsWith(key + ":") ? i : -1).filter((i) => i >= 0);
    if (at.length > 1) throw Error("Duplicate sync property; refusing to modify note.");
    const line = key + ": " + JSON.stringify(value);
    if (at.length === 1) lines[at[0]] = line;
    else lines.push(line);
  }
  return "---\n" + lines.join("\n") + "\n---\n" + raw.slice(match[0].length);
}
function cloudSyncReplaceBody(raw, body) {
  // Notes created by 0.1.17 and earlier can use an HTML marker or a legacy
  // guidance line instead of a visible ## body heading. All three are
  // recognized by the existing standalone Email parser.
  const priorBody = extractStandaloneEmailBody(raw);
  const marker = "<!-- hakisend:email-body:start -->";
  const markerAt = raw.indexOf(marker);
  const heading = /^## (?:Email body|Nội dung email)[ \t]*$/im.exec(raw);
  let next;
  if (markerAt >= 0) {
    next = raw.slice(0, markerAt + marker.length) +
      "\n\n## Nội dung email\n\n" + body.trim() + "\n";
  } else if (heading) {
    next = raw.slice(0, heading.index) + "## Nội dung email\n\n" + body.trim() + "\n";
  } else {
    // Guidance-only plans are supported, but only if the exact parsed body
    // is a terminal suffix. Any ambiguity leaves the original note intact.
    const trimmed = raw.trimEnd();
    if (!priorBody || !trimmed.endsWith(priorBody))
      throw Error("Cannot safely locate legacy Email body suffix.");
    next = trimmed.slice(0, trimmed.length - priorBody.length) +
      "## Nội dung email\n\n" + body.trim() + "\n";
  }
  if (extractStandaloneEmailBody(next) !== body.trim())
    throw Error("Cloud Sync refused an Email body-changing layout migration.");
  return next;
}
function cloudSyncNote(doc, hashValue) {
  const frozen = !doc.editable;
  const state = frozen ? doc.campaign_status === "done" ? "email_completed" : "email_needs_review" : "local_draft";
  const properties = {
    hakisend_type: "email_campaign",
    hakisend_email_kind: "standalone",
    site_uid: doc.site_uid,
    email_subject: doc.subject,
    email_preheader: doc.preheader,
    email_list_uid: doc.list_uid,
    email_send_policy: "now",
    hakisend_remote_email_draft_uid: doc.uid,
    hakisend_remote_email_revision: doc.revision,
    hakisend_remote_email_status: "private_draft",
    hakisend_acelle_campaign_uid: doc.campaign_uid || "",
    hakisend_acelle_campaign_status: frozen ? "synced_snapshot" : "",
    hakisend_sync_campaign_status: doc.campaign_status || "",
    hakisend_import_snapshot: frozen,
    hakisend_read_only: frozen,
    email_dispatch_ready: frozen,
    hakisend_status: state,
    hakisend_sync_managed: true,
    hakisend_sync_base_hash: hashValue
  };
  const front = Object.entries(properties).map(([k, v]) => k + ": " + JSON.stringify(v)).join("\n");
  const callout = cloudSyncStatusCallout(doc);
  return "---\n" + front + "\n---\n\n" + callout + "\n\n## Nội dung email\n\n" + doc.body_markdown.trim() + "\n";
}
function cloudSyncStatusCallout(doc) {
  return !doc.editable
    ? "> [!info] HakiSend · Bản email đồng bộ chỉ đọc · Campaign: " + (doc.campaign_status || "chưa rõ") + " · Không gửi lại từ bản sao này."
    : "> [!success] Saved on HakiSend · Private Draft · Revision " + doc.revision + " — NOT sent";
}
function cloudSyncRefreshCallout(raw, doc) {
  const front = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!front) throw Error("Cloud Sync requires intact YAML properties.");
  const markerAt = raw.indexOf("<!-- hakisend:email-body:start -->", front[0].length);
  const heading = /^## (?:Email body|Nội dung email)[ \t]*$/im.exec(raw);
  const end = Math.min(
    markerAt >= 0 ? markerAt : raw.length,
    heading && heading.index >= front[0].length ? heading.index : raw.length
  );
  const head = raw.slice(front[0].length, end);
  const tail = raw.slice(end);
  const pattern = /^> \[!(?:info|success|warning|danger)\] [^\r\n]*HakiSend[^\r\n]*(?:\r?\n> (?!\[!)[^\r\n]*)*/m;
  const updated = pattern.test(head)
    ? head.replace(pattern, cloudSyncStatusCallout(doc))
    : "\n" + cloudSyncStatusCallout(doc) + "\n" + head;
  return front[0] + updated + tail;
}
var HakiSendPublishedPostNoticeModal = class extends import_obsidian.Modal {
  constructor(app, plugin, file, original, fields, siteUid, expectedPostUid = "") {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.original = original;
    this.fields = fields;
    this.siteUid = siteUid || "";
    this.sourceSiteUid = siteUid || "";
    this.expectedPostUid = expectedPostUid;
    this.site = plugin.settings.sites.find((row) => row.uid === siteUid);
    this.category = publishedPostCategory(fields);
    this.localTitle = String(fields.title || file.basename).trim();
    this.title = this.localTitle;
    this.serverPost = null;
    this.urlResolveRevision = 0;
    this.urlResolutionError = "";
    this.form = {
      publicUrl: "",
      subject: "Bài viết mới: " + this.title,
      preheader: "",
      introduction: "",
      publicExcerpt: "",
      publicSummary: "",
      publicFreeContent: "",
      excerptSource: "membership_guest_page",
      guestPreviewVerified: false,
      listUid: "",
      confirmedPublic: false
    };
    this.audiences = [];
    this.selectedLists = new Map();
    this.listArea = null;
    this.listError = "";
    this.publicUrlArea = null;
    this.guestPreviewArea = null;
    this.reloadPreviewButton = null;
    this.guestPreviewError = "";
    this.guestPreviewHasLock = false;
    this.guestPreviewShortened = false;
    this.previewRevision = 0;
    this.confirmationToggle = null;
    this.busy = false;
    this.revision = 0;
    this.updateAutoUrl();
  }
  updateAutoUrl() {
    const revision = ++this.urlResolveRevision;
    const targetSiteUid = this.siteUid;
    this.form.publicUrl = "";
    this.serverPost = null;
    this.urlResolutionError = "";
    this.form.confirmedPublic = false;
    this.form.publicExcerpt = "";
    this.form.publicSummary = "";
    this.form.publicFreeContent = "";
    this.form.guestPreviewVerified = false;
    this.guestPreviewError = "";
    this.previewRevision++;
    this.confirmationToggle?.setValue(false);
    this.reloadPreviewButton?.setDisabled(!this.form.publicUrl);
    this.renderAutoUrl();
    this.renderGuestPreview();
    if (!targetSiteUid) return;
    void this.plugin.resolvePublishedPostUrl(targetSiteUid, this.fields.external_id).then((post) => {
      if (revision !== this.urlResolveRevision || this.siteUid !== targetSiteUid) return;
      if (this.expectedPostUid && post.uid !== this.expectedPostUid)
        throw Error("Bản nháp email không khớp với UID Post gốc trên HakiSend.");
      this.serverPost = post;
      this.category = post.categorySlug;
      this.title = post.title;
      this.form.publicUrl = post.publicUrl;
      this.reloadPreviewButton?.setDisabled(false);
      this.renderAutoUrl();
      void this.refreshLists();
      void this.refreshGuestPreview();
    }).catch((error) => {
      if (revision !== this.urlResolveRevision || this.siteUid !== targetSiteUid) return;
      this.urlResolutionError = "Không lấy được URL Post từ HakiSend: " + String(error).slice(0, 230);
      this.guestPreviewError = this.urlResolutionError;
      this.reloadPreviewButton?.setDisabled(true);
      this.renderAutoUrl();
      this.renderGuestPreview();
    });
  }
  renderGuestPreview() {
    if (!this.guestPreviewArea) return;
    const c = this.guestPreviewArea;
    c.empty();
    c.createEl("h4", { text: "Phần nội dung công khai theo Membership" });
    if (this.guestPreviewError) {
      c.createEl("p", { text: this.guestPreviewError });
    } else if (this.form.guestPreviewVerified) {
      c.createEl("p", { text: this.guestPreviewHasLock
        ? "Membership đã giới hạn phần đọc thử. Email chỉ lấy phần khách chưa đăng nhập nhìn thấy."
        : "Bài viết được hiển thị công khai; đoạn dưới đây đã lấy từ trang dành cho khách." });
      c.createEl("p", { text: "Bản nháp sử dụng toàn bộ phần Free đang hiển thị cho khách, giới hạn an toàn 100 KB; nội dung dài hơn sẽ được báo lỗi để duyệt lại." });
      c.createEl("pre", { text: this.form.publicExcerpt
        ? this.form.publicExcerpt.slice(0, 1800) + (this.form.publicExcerpt.length > 1800 ? "\n…" : "")
        : "Không có đoạn đọc thử công khai; email sẽ chỉ có lời dẫn và liên kết bài viết." });
    } else {
      c.createEl("p", { text: this.form.publicUrl
        ? "Đang lấy nội dung khách chưa đăng nhập được đọc trên HakiSend…"
        : "Chưa có URL bài viết công khai. Hãy chọn Site và xử lý thông báo ở mục URL trước khi tải phần đọc thử." });
    }
  }
  async loadGuestPreview(url) {
    const page = await (0, import_obsidian.requestUrl)({
      url, method: "GET",
      headers: { "Accept": "text/html", "Cookie": "", "Cache-Control": "no-cache" },
      throw: false // No HakiSend bearer token or member session cookie.
    });
    if (page.status !== 200 || typeof page.text !== "string")
      throw Error("Bài viết chưa truy cập công khai (HTTP " + page.status + ").");
    return publicMembershipExcerptFromPage(page.text, this.title, url);
  }
  async refreshGuestPreview() {
    const current = ++this.previewRevision;
    const url = this.form.publicUrl;
    this.form.guestPreviewVerified = false;
    this.form.publicExcerpt = "";
    this.form.publicSummary = "";
    this.form.publicFreeContent = "";
    this.guestPreviewError = "";
    this.form.confirmedPublic = false;
    this.confirmationToggle?.setValue(false);
    this.renderGuestPreview();
    if (!url) {
      this.guestPreviewError = "Chưa thể tải phần đọc thử vì chưa xác định được URL công khai. Kiểm tra Site và domain phía trên.";
      this.renderGuestPreview();
      return;
    }
    try {
      const result = await this.loadGuestPreview(url);
      if (current !== this.previewRevision || url !== this.form.publicUrl) return;
      this.form.publicExcerpt = result.excerpt;
      this.form.publicSummary = result.summary;
      this.form.publicFreeContent = result.freeContent;
      this.form.guestPreviewVerified = true;
      this.guestPreviewHasLock = result.hasLock;
      this.guestPreviewShortened = result.shortened;
      this.renderGuestPreview();
    } catch (e) {
      if (current !== this.previewRevision || url !== this.form.publicUrl) return;
      this.guestPreviewError = "Chưa lấy được phần đọc thử công khai: " + String(e).slice(0, 210);
      this.renderGuestPreview();
    }
  }
  renderAutoUrl() {
    if (!this.publicUrlArea) return;
    const c = this.publicUrlArea;
    c.empty();
    c.createEl("h4", { text: "URL bài viết công khai — tự động" });
    if (this.form.publicUrl) {
      c.createEl("p", { text: this.form.publicUrl });
      c.createEl("p", { text: "Đã lấy từ Post gốc trên HakiSend theo external_id. Plugin kiểm tra HTTP 200, URL canonical và tiêu đề bài viết trước khi tạo email." });
      return;
    }
    if (!this.siteUid) {
      c.createEl("p", { text: "Chọn Site chứa Post trước để tự lấy liên kết." });
      return;
    }
    if (this.urlResolutionError) {
      c.createEl("p", { text: this.urlResolutionError });
      return;
    }
    const origin = publicOriginForSite(this.site, this.plugin.settings, this.siteUid);
    if (origin) {
      c.createEl("p", { text: "Đã có domain " + origin + ". Đang lấy URL chính thức từ Post trên HakiSend, không cần Category/Slug trong Obsidian." });
      return;
    }
    if (this.site && Object.prototype.hasOwnProperty.call(this.site, "public_origin")) {
      c.createEl("p", { text: "HakiSend chưa xác nhận URL công khai đang hoạt động cho Site này. Hãy kiểm tra domain liên kết và trạng thái Publish Site trên HakiSend." });
      return;
    }
    c.createEl("p", { text: "API cũ chưa cung cấp tên miền công khai cho Site này. Hãy nâng cấp Sites để lấy URL Post chính thức; tên miền thủ công chỉ dành cho chế độ API cũ." });
    let draftOrigin = "";
    const feedback = c.createEl("p", { text: "Chỉ nhập domain HTTPS của Site, không nhập đường dẫn của một bài viết." });
    new import_obsidian.Setting(c).setName("Tên miền công khai của Site (một lần)")
      .addText((t) => t.setPlaceholder("https://tenmiencuasite.com")
        .onChange((v) => { draftOrigin = v; }))
      .addButton((b) => b.setButtonText("Lưu tên miền Site").onClick(async () => {
        const normalized = normalizePublicSiteOrigin(draftOrigin);
        if (!normalized) {
          feedback.setText("Không lưu: hãy nhập domain HTTPS hợp lệ, không kèm đường dẫn hoặc tham số.");
          new import_obsidian.Notice("Không lưu tên miền: ô trống hoặc URL không hợp lệ.");
          return;
        }
        if (!this.siteUid || !this.site || this.site.uid !== this.siteUid) {
          feedback.setText("Không lưu: hãy chọn đúng Site trước.");
          new import_obsidian.Notice("Không lưu tên miền: Site chưa hợp lệ.");
          return;
        }
        if (!this.plugin.settings.sitePublicOrigins) this.plugin.settings.sitePublicOrigins = {};
        const previousOrigin = this.plugin.settings.sitePublicOrigins[this.siteUid];
        this.plugin.settings.sitePublicOrigins[this.siteUid] = normalized;
        try {
          await this.plugin.saveSettings();
        } catch (error) {
          if (previousOrigin === void 0) delete this.plugin.settings.sitePublicOrigins[this.siteUid];
          else this.plugin.settings.sitePublicOrigins[this.siteUid] = previousOrigin;
          feedback.setText("Không lưu được cấu hình Vault: " + String(error).slice(0, 160));
          new import_obsidian.Notice("Lỗi lưu domain. Hãy kiểm tra quyền ghi cấu hình Obsidian.");
          return;
        }
        this.updateAutoUrl();
        new import_obsidian.Notice("Đã lưu domain " + normalized + " cho Site " + this.site.name + ".");
      }));
  }
  onOpen() {
    this.titleEl.setText("Email thông báo bài viết đã xuất bản");
    const c = this.contentEl;
    c.empty();
    c.createEl("p", { text: "Bài viết: " + this.title });
    if (!this.sourceSiteUid) {
      c.createEl("p", { text: "Post này dùng metadata Publisher cũ và chưa xác định Site UID. Hãy chọn đúng HakiSend Site đang chứa bài viết; không chỉnh sửa Properties của Post." });
      new import_obsidian.Setting(c).setName("Site chứa Post cũ").addDropdown((d) => {
        d.addOption("", "Chọn HakiSend Site");
        for (const row of this.plugin.settings.sites) d.addOption(row.uid, row.name);
        d.setValue(this.siteUid).onChange((v) => {
          this.siteUid = v;
          this.site = this.plugin.settings.sites.find((row) => row.uid === v);
          this.form.listUid = "";
          this.audiences = [];
          this.selectedLists.clear();
          this.form.confirmedPublic = false;
          this.confirmationToggle?.setValue(false);
          this.renderList();
          this.updateAutoUrl();
          if (v) void this.refreshLists();
        });
      });
    } else {
      c.createEl("p", { text: "Site: " + (this.site?.name || this.siteUid) });
    }
    c.createEl("p", { text: "Membership quyết định nội dung được đọc miễn phí theo Site, Category và Post. Plugin lấy bản đã giới hạn trên trang công khai, không cần đánh dấu Free trong Obsidian." });
    this.publicUrlArea = c.createDiv();
    this.renderAutoUrl();
    this.guestPreviewArea = c.createDiv();
    this.renderGuestPreview();
    new import_obsidian.Setting(c).addButton((b) => {
      this.reloadPreviewButton = b;
      b.setButtonText("Tải lại phần đọc thử công khai")
        .setDisabled(!this.form.publicUrl)
        .onClick(() => this.refreshGuestPreview());
    });
    new import_obsidian.Setting(c).setName("Tiêu đề email")
      .addText((t) => t.setValue(this.form.subject).onChange((v) => { this.form.subject = v; }));
    new import_obsidian.Setting(c).setName("Dòng xem trước email")
      .addText((t) => t.setPlaceholder("Tùy chọn").onChange((v) => { this.form.preheader = v; }));
    new import_obsidian.Setting(c).setName("Lời dẫn trong email")
      .setDesc("Tùy chọn. Sau khi tạo bản nháp, Kiên có thể sửa toàn bộ email trước khi gửi.")
      .addTextArea((t) => t.setPlaceholder("Mời bạn đọc bài viết mới của tôi...")
        .onChange((v) => { this.form.introduction = v; }));
    this.listArea = c.createDiv();
    this.renderList();
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Tải lại danh sách email").onClick(() => this.refreshLists()));
    new import_obsidian.Setting(c).setName("Đã xem và đồng ý với phần đọc thử công khai phía trên")
      .setDesc("Plugin đã tải trang như khách chưa đăng nhập. Kiên kiểm tra đoạn này trước khi tạo email nháp.")
      .addToggle((t) => {
        this.confirmationToggle = t;
        t.setValue(false).onChange((v) => { this.form.confirmedPublic = v; });
      });
    const status = c.createEl("p", { text: "Mỗi lần chỉ tạo bản nháp cho một List. Chưa có email nào được gửi hoặc lên lịch." });
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Tạo bản nháp cho List đã chọn").setCta().onClick(async () => {
      if (this.busy) return;
      this.busy = true;
      b.setDisabled(true);
      const createdFiles = [];
      try {
        const selected = [...this.selectedLists.entries()].map(([uid, value]) => ({ uid, ...value }));
        if (!this.siteUid || selected.length !== 1 ||
          selected.some((row) => !this.audiences.some((a) => a.uid === row.uid && a.post_notice_reserved !== true)))
          throw Error("Hãy chọn đúng 1 List chưa được gửi hoặc lên lịch cho Post này.");
        if (!this.plugin.settings.sites.some((x) => x.uid === this.siteUid))
          throw Error("Site này không còn được kết nối.");
        const active = this.app.workspace.getActiveFile();
        const latest = await this.app.vault.read(this.file);
        if (!active || active.path !== this.file.path || latest !== this.original)
          throw Error("Bài viết đã thay đổi; hãy mở lại lệnh để kiểm tra trích đoạn.");
        const fields = localEmailFieldsFromRaw(latest, this.fields);
        if (!publishedPostStatus(fields.status) || fields.external_id !== this.fields.external_id ||
          this.sourceSiteUid && this.sourceSiteUid !== this.siteUid ||
          String(fields.title || this.file.basename).trim() !== this.localTitle)
          throw Error("Thông tin xuất bản của Post đã thay đổi.");
        const verifiedLists = await this.plugin.loadPostNoticeAudiencesForSite(this.siteUid, this.serverPost?.uid);
        if (selected.some((row) => !verifiedLists.some((a) => isAudience(a) && a.uid === row.uid && a.post_notice_reserved !== true)))
          throw Error("Một hoặc nhiều List đã được dùng hoặc bị thu hồi. Tải lại danh sách trước khi tạo nháp.");
        const serverPost = await this.plugin.resolvePublishedPostUrl(this.siteUid, fields.external_id);
        if (this.expectedPostUid && serverPost.uid !== this.expectedPostUid)
          throw Error("Post gốc đã thay đổi, không thể tạo bản gửi tiếp.");
        const expectedUrl = serverPost.publicUrl;
        if (!this.serverPost || serverPost.uid !== this.serverPost.uid ||
          serverPost.categorySlug !== this.serverPost.categorySlug ||
          serverPost.slug !== this.serverPost.slug || serverPost.title !== this.serverPost.title ||
          expectedUrl !== this.form.publicUrl)
          throw Error("Post hoặc đường dẫn chính thức trên HakiSend đã thay đổi. Hãy tải lại cửa sổ.");
        if (!this.form.guestPreviewVerified)
          throw Error("Hãy chờ tải và xem phần đọc thử công khai từ Membership.");
        status.setText("Đang kiểm tra lại chính sách nội dung công khai...");
        const fresh = await this.loadGuestPreview(expectedUrl);
        if (fresh.excerpt !== this.form.publicExcerpt || fresh.summary !== this.form.publicSummary ||
          fresh.freeContent !== this.form.publicFreeContent || fresh.hasLock !== this.guestPreviewHasLock ||
          fresh.shortened !== this.guestPreviewShortened) {
          this.form.guestPreviewVerified = false;
          this.guestPreviewError = "Phần công khai đã thay đổi. Hãy tải lại phần đọc thử và duyệt lại.";
          this.form.confirmedPublic = false;
          this.confirmationToggle?.setValue(false);
          this.renderGuestPreview();
          throw Error(this.guestPreviewError);
        }
        // Validate the single chosen plan and allocate its path before the Vault write.
        // No remote send, schedule, Campaign or Private Draft is created here.
        const allocated = new Set();
        const planned = selected.map((row) => {
          const audience = verifiedLists.find((a) => a.uid === row.uid);
          const plan = createPublishedPostEmailNotice({
            ...this.form, listUid: row.uid, listName: audience.name, subject: row.subject,
            preheader: row.preheader, siteUid: this.siteUid,
            sourcePath: this.file.path, sourceMarkdown: latest, status: fields.status,
            postUid: serverPost.uid, postTitle: serverPost.title,
            postSlug: serverPost.slug, category: serverPost.categorySlug,
            serverVerified: true,
            readOnly: fields.hakisend_import_snapshot === true || fields.hakisend_read_only === true
          });
          const paths = localEmailPlanPaths(this.siteUid, "standalone", row.subject + " - " + audience.name);
          let path = "";
          for (let n = 1; n <= 1e3; n++) {
            const candidate = paths.directory + "/" + paths.basename + (n === 1 ? "" : " (" + n + ")") + ".md";
            if (allocated.has(candidate) || this.app.vault.getAbstractFileByPath(candidate)) continue;
            path = candidate;
            allocated.add(candidate);
            break;
          }
          if (!path) throw Error("Không còn tên tệp trống cho List " + audience.name);
          return { path, plan };
        });
        const paths = localEmailPlanPaths(this.siteUid, "standalone", selected[0].subject);
        if (!this.app.vault.getAbstractFileByPath(paths.root)) await this.app.vault.createFolder(paths.root);
        if (!this.app.vault.getAbstractFileByPath(paths.directory)) await this.app.vault.createFolder(paths.directory);
        for (const entry of planned) {
          createdFiles.push(await this.app.vault.create(entry.path, entry.plan.planMarkdown));
        }
        this.close();
        await this.app.workspace.getLeaf(true).openFile(createdFiles[0]);
        new import_obsidian.Notice("Đã tạo 1 bản nháp từ toàn bộ nội dung Free đã xác minh. Chưa gửi hay đặt lịch. List khác cần một lần tạo riêng.");
        await this.plugin.openR3EmailOnlyLifecycle();
      } catch (e) {
        const prefix = createdFiles.length
          ? "Đã tạo " + createdFiles.length + " nháp trước khi gặp lỗi; KHÔNG tạo lại hàng loạt. "
          : "Chưa tạo email: ";
        status.setText(prefix + String(e).slice(0, 240));
        new import_obsidian.Notice(prefix + String(e).slice(0, 160));
      } finally {
        this.busy = false;
        b.setDisabled(false);
      }
    }));
    if (this.siteUid) void this.refreshLists();
    if (this.form.publicUrl) void this.refreshGuestPreview();
  }
  async refreshLists() {
    const current = ++this.revision;
    if (!this.siteUid) return;
    if (!this.serverPost?.uid) {
      this.audiences = [];
      this.selectedLists.clear();
      this.listError = "Đang xác nhận Post gốc trên HakiSend trước khi kiểm tra các List đã gửi…";
      this.renderList();
      return;
    }
    const targetSite = this.siteUid;
    try {
      const rows = await this.plugin.loadPostNoticeAudiencesForSite(targetSite, this.serverPost.uid);
      if (current !== this.revision || targetSite !== this.siteUid) return;
      if (!Array.isArray(rows) || rows.length > 500 || !rows.every(isAudience)) throw Error("Danh sách không hợp lệ.");
      this.audiences = rows;
      // Preserve per-List edits on refresh, but remove revoked/reserved Lists.
      const eligible = new Set(rows.filter((x) => !x.post_notice_reserved).map((x) => x.uid));
      for (const uid of this.selectedLists.keys()) if (!eligible.has(uid)) this.selectedLists.delete(uid);
      this.listError = "";
      this.renderList();
    } catch (e) {
      if (current !== this.revision || targetSite !== this.siteUid) return;
      this.audiences = [];
      this.selectedLists.clear();
      this.listError = e?.status === 403 || /HTTP 403/.test(String(e))
        ? "HakiSend từ chối quyền đọc List (HTTP 403). Vào Settings → HakiSend Publisher → Email Draft Access → Reconnect with Email Draft Access, sau đó kiểm tra đã chọn đúng Site có List."
        : "Không tải được List: " + String(e).slice(0, 160);
      this.renderList();
      new import_obsidian.Notice(this.listError);
    }
  }
  renderList() {
    if (!this.listArea) return;
    this.listArea.empty();
    this.listArea.createEl("h4", { text: "Chọn 1 Email List của Site" });
    this.listArea.createEl("p", { text: "Chỉ một List mỗi lần tạo nháp. Chọn List khác sẽ thay thế lựa chọn trước; nội dung email vẫn được duyệt riêng trước khi gửi." });
    for (const row of this.audiences.filter((x) => !x.post_notice_reserved)) {
      const detail = this.selectedLists.get(row.uid);
      new import_obsidian.Setting(this.listArea).setName(row.name).addToggle((toggle) => {
        toggle.setValue(!!detail).onChange((chosen) => {
          if (chosen) {
            this.selectedLists.clear();
            this.selectedLists.set(row.uid, {
              subject: this.form.subject, preheader: this.form.preheader
            });
          } else this.selectedLists.delete(row.uid);
          this.renderList();
        });
      });
      if (detail) {
        new import_obsidian.Setting(this.listArea).setName("Tiêu đề · " + row.name)
          .addText((input) => input.setValue(detail.subject)
            .onChange((value) => { detail.subject = value; }));
        new import_obsidian.Setting(this.listArea).setName("Dòng xem trước · " + row.name)
          .addText((input) => input.setValue(detail.preheader)
            .onChange((value) => { detail.preheader = value; }));
      }
    }
    this.listArea.createEl("p", { text: "Đã chọn: " + this.selectedLists.size + "/1 List. Không gửi hay lên lịch tại bước tạo nháp." });
    const reserved = this.audiences.filter((x) => x.post_notice_reserved);
    if (reserved.length) this.listArea.createEl("p", {
      text: "Đã gửi hoặc đã đặt lịch cho Post này (không chọn lại): " + reserved.map((x) => x.name).join(", ")
    });
    if (this.audiences.length && reserved.length === this.audiences.length)
      this.listArea.createEl("p", { text: "Tất cả List đã được sử dụng. Có thể tạo List khác trên HakiSend rồi tải lại." });
    if (this.listError) this.listArea.createEl("p", { text: this.listError });
  }
  onClose() { this.revision++; this.previewRevision++; this.confirmationToggle = null; this.publicUrlArea = null; this.guestPreviewArea = null; this.contentEl.empty(); }
};
var HakiSendCloudSyncModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.selectedSite = "all";
  }
  onOpen() {
    this.titleEl.setText("HakiSend · Đồng bộ email");
    const root = this.contentEl;
    root.empty();
    root.createEl("p", { text: "Tải email từ HakiSend về thiết bị này và cập nhật hai chiều những bản nháp chưa chuyển thành chiến dịch. Đồng bộ KHÔNG gửi email hoặc xuất bản nội dung." });
    new import_obsidian.Setting(root).setName("Site").addDropdown((d) => {
      d.addOption("all", "Tất cả Site đã kết nối");
      for (const site of this.plugin.settings.sites) d.addOption(site.uid, site.name);
      d.onChange((value) => {
        this.selectedSite = value;
      });
    });
    new import_obsidian.Setting(root).setName("Tự đồng bộ khi mở Obsidian")
      .setDesc("Chỉ tự đồng bộ khi ứng dụng đang mở. Tắt mặc định trong lần kiểm thử đầu tiên.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.cloudSyncAutoEnabled === true);
        toggle.onChange(async (value) => {
          this.plugin.settings.cloudSyncAutoEnabled = value;
          await this.plugin.saveSettings();
        });
      });
    const progress = root.createEl("div");
    let completed = false;
    new import_obsidian.Setting(root).addButton((b) => b.setButtonText("Đồng bộ ngay").setCta().onClick(async () => {
      if (completed) { this.close(); return; }
      b.setDisabled(true);
      progress.setText("Đang đối chiếu bản nháp và lịch sử chiến dịch...");
      try {
        const result = await this.plugin.cloudSyncEmails(this.selectedSite, (message) => progress.setText(message));
        progress.empty();
        progress.createEl("p", { text: "Đã tải " + result.imported + " email mới · nhận " + result.downloaded + " cập nhật · đẩy " + result.uploaded + " bản nháp · " + result.unchanged + " không đổi." });
        progress.createEl("p", { text: result.conflicts + " xung đột · " + result.deferred + " ghi chú đang mở được giữ nguyên · " + result.errors.length + " lỗi." });
        for (const error of result.errors.slice(0, 12)) progress.createEl("p", { text: error });
        if (result.errors.length > 12) progress.createEl("p", { text: "Còn " + (result.errors.length - 12) + " lỗi chưa hiển thị." });
        completed = true;
        b.setButtonText("Đóng");
      } catch (e) {
        progress.setText("Đồng bộ dừng an toàn: " + String(e).slice(0, 240) + ". Không có email nào được gửi.");
      } finally {
        b.setDisabled(false);
      }
    }));
  }
  onClose() {
    this.contentEl.empty();
  }
};
var HAKISEND_END_USER_COMMANDS = Object.freeze({
  "connect-hakisend": "Connect account",
  "new-post": "New website post",
  "select-note-site": "Choose site for note",
  "edit-post-properties": "Edit post properties",
  "save-current-note": "Save post",
  "publish-current-note": "Publish post now",
  "schedule-current-note": "Schedule post",
  "post-create-published-email-notice": "Create email from published post",
  "r3-email-simple-entry": "Email — create or continue",
  "open-hakisend-website-email-calendar": "Content calendar (Website + Email)"
});
var HakiSendPublisherPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.settingTab = null;
    this.r3StatusSyncBusy = false;
    this.cloudSyncBusy = false;
  }
  registerUserCommand(command) {
    const simplified = HAKISEND_END_USER_COMMANDS[command.id];
    if (typeof simplified === "string") {
      return this.addCommand({ ...command, name: simplified });
    }
    if (this.settings.uiAdvancedCommands === true) return this.addCommand(command);
    return null;
  }
  async onload() {
    await this.loadSettings();
    this.registerEvent(this.app.workspace.on("file-open", () => {
      this.r3UpdateEmailPropertyVisibility();
      void this.r3SyncActiveEmailStatus(false);
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.r3UpdateEmailPropertyVisibility();
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      if (file?.path?.startsWith(ROOT2)) this.r3UpdateEmailPropertyVisibility();
    }));
    this.registerInterval(window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void this.r3SyncActiveEmailStatus(false);
    }, 9e4));
    this.app.workspace.onLayoutReady(() => {
      this.r3UpdateEmailPropertyVisibility();
      void this.r3SyncActiveEmailStatus(false);
      if (this.settings.cloudSyncAutoEnabled === true) {
        void this.cloudSyncEmails("all").catch(() => {});
      }
    });
    this.registerInterval(window.setInterval(() => {
      if (this.settings.cloudSyncAutoEnabled !== true ||
        typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void this.cloudSyncEmails("all").catch(() => {});
    }, 3e5));
    this.register(() => {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown"))
        leaf.view?.containerEl?.classList?.remove("hakisend-email-simple");
    });
    this.registerObsidianProtocolHandler(
      CONNECT_CALLBACK_ACTION,
      async (params) => {
        await this.handleConnectCallback(
          params
        );
      }
    );
    this.registerUserCommand({
      id: "connect-hakisend",
      name: "HakiSend: Connect account",
      callback: async () => {
        await this.startBrowserConnect();
      }
    });
    this.registerUserCommand({
      id: "reconnect-email-draft-access",
      name: "HakiSend: Reconnect with Email Draft Access (NOT send)",
      callback: async () => {
        if (!this.hasSecureConnection()) {
          new import_obsidian.Notice("Connect a secure HakiSend Publishing account first.");
          return;
        }
        await this.startBrowserConnect(true);
      }
    });
    this.registerUserCommand({
      id: "new-post",
      name: "HakiSend: New Post",
      callback: async () => {
        await this.openNewPost();
      }
    });
    this.registerUserCommand({
      id: "select-note-site",
      name: "HakiSend: Choose Site for this Note",
      callback: () => this.openSelectSiteForNote()
    });
    this.registerUserCommand({
      id: "edit-post-properties",
      name: "HakiSend: Edit Post Properties",
      callback: async () => {
        await this.openPostProperties();
      }
    });
    this.registerUserCommand({
      id: "save-current-note",
      name: "HakiSend: Save Changes",
      callback: async () => {
        await this.saveCurrentNote();
      }
    });
    this.registerUserCommand({
      id: "publish-current-note",
      name: "HakiSend: Publish Now",
      callback: async () => {
        await this.publishCurrentNote();
      }
    });
    this.registerUserCommand({
      id: "post-create-published-email-notice",
      name: "HakiSend: Tạo email thông báo từ Post đã xuất bản",
      callback: async () => {
        await this.openPublishedPostEmailNotice();
      }
    });
    this.registerUserCommand({
      id: "schedule-current-note",
      name: "HakiSend: Schedule",
      callback: () => {
        this.openScheduleCurrentNote();
      }
    });
    this.registerUserCommand({
      id: "view-post-publishing-calendar",
      name: "HakiSend: Xem lịch xuất bản Website (tất cả Site)",
      callback: () => new HakiSendPostCalendarModal(this.app, this).open()
    });
    this.registerUserCommand({
      id: "open-hakisend-website-email-calendar",
      name: "HakiSend: Calendar Website + Email (lịch native trên HakiSend)",
      callback: () => new HakiSendNativeContentCalendarModal(this.app, this).open()
    });
    this.registerUserCommand({
      id: "r3-create-multichannel-distribution-plan",
      name: "HakiSend (Nâng cao): Lập kế hoạch đa kênh trên máy (chưa gửi)",
      callback: () => new HakiSendR3MultichannelPlanModal(
        this.app,
        this.settings.sites,
        this.settings.defaultSiteUid,
        async (site) => {
          if (!this.hasSecureConnection()) throw Error("Secure OAuth email:read required.");
          const token = await this.getAccessToken();
          const origin = normalizeBaseUrl(this.settings.apiBaseUrl);
          const result = await requestPrivateDraft(
            (req) => (0, import_obsidian.requestUrl)(req),
            origin,
            site,
            token,
            "audiences",
            "GET"
          );
          if (!Array.isArray(result) || !result.every(isAudience))
            throw Error("Audience authorization could not be verified.");
          return result;
        }
      ).open()
    });
    this.registerUserCommand({
      id: "r3-view-local-multichannel-plan-calendar",
      name: "HakiSend (Nâng cao): Xem lịch kế hoạch trên máy (chưa gửi)",
      callback: () => new HakiSendR3LocalMultichannelCalendarModal(
        this.app,
        this.settings.sites
      ).open()
    });
    this.registerUserCommand({
      id: "r3-email-only-from-markdown",
      name: "HakiSend (Nâng cao): Chuyển ghi chú hiện tại thành email",
      callback: async () => {
        await this.openR3EmailOnlyImport();
      }
    });
    this.registerUserCommand({
      id: "r3-email-only-workflow",
      name: "HakiSend: 2. Tiếp tục gửi email",
      callback: async () => {
        await this.openR3EmailOnlyLifecycle();
      }
    });
    this.registerUserCommand({
      id: "email-create-local-plan",
      name: "HakiSend: 1. Tạo email mới",
      callback: () => new HakiSendLocalEmailPlannerModal(
        this.app,
        this.settings.sites,
        this.settings.defaultSiteUid,
        (siteUid) => this.loadAuthorizedEmailListsForLocalPlan(siteUid)
      ).open()
    });
    this.registerUserCommand({
      id: "email-browse-local-plans",
      name: "HakiSend: Xem các email đang soạn",
      callback: () => new HakiSendLocalEmailPlanBrowserModal(this.app).open()
    });
    this.registerUserCommand({
      id: "r3-email-simple-entry",
      name: "HakiSend: Email — Tạo mới hoặc tiếp tục",
      callback: async () => this.openR3SimpleEmailEntry()
    });
    this.registerUserCommand({
      id: "hakisend-cloud-sync-emails",
      name: "HakiSend: Đồng bộ email giữa Android và máy tính",
      callback: () => new HakiSendCloudSyncModal(this.app, this).open()
    });
    this.addRibbonIcon("mail", "Email HakiSend — Tạo mới hoặc tiếp tục", async () => {
      await this.openR3SimpleEmailEntry();
    });
    this.registerUserCommand({
      id: "save-standalone-email-private-draft",
      name: "HakiSend (Nâng cao): Lưu email lên máy chủ, chưa gửi",
      callback: async () => {
        await this.openManualPrivateDraftSave();
      }
    });
    this.registerUserCommand({
      id: "promote-private-email-to-acelle-draft",
      name: "HakiSend (Nâng cao): Chuẩn bị chiến dịch email",
      callback: async () => {
        await this.openManualPrivateDraftPromotion();
      }
    });
    this.registerUserCommand({
      id: "recover-acelle-campaign-draft-receipt",
      name: "HakiSend (Nâng cao): Kiểm tra lại chiến dịch đang tạo",
      callback: async () => {
        await this.recoverManualPrivatePromotion();
      }
    });
    this.registerUserCommand({
      id: "r3-reconnect-native-delivery",
      name: "HakiSend (Nâng cao): Cấp quyền gửi email",
      callback: async () => {
        await this.startBrowserConnect(true, true);
      }
    });
    this.registerUserCommand({
      id: "r3-native-email-delivery",
      name: "HakiSend (Nâng cao): Gửi hoặc đặt lịch theo mã chiến dịch",
      callback: () => this.createR3NativeDeliveryModal().open()
    });
    this.registerUserCommand({
      id: "r3-recover-pending-delivery-receipts",
      name: "HakiSend: Recover Pending Send/Schedule Receipts (R3 \xB7 GET only)",
      callback: () => {
        try {
          const saved = this.settings.r3PendingIntents;
          const snapshot = knownPendingR3Receipts(saved, this.settings.sites);
          const modal = new import_obsidian.Modal(this.app);
          modal.titleEl.setText("HakiSend · Kiểm tra kết quả gửi email");
          modal.contentEl.createEl("p", { text: "Chỉ kiểm tra kết quả các yêu cầu trước đó; không gửi email thêm lần nữa." });
          const names = new Map();
          for (const file of this.app.vault.getMarkdownFiles()) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            if (typeof fm?.site_uid !== "string" || typeof fm?.hakisend_acelle_campaign_uid !== "string") continue;
            const emailName = typeof fm.email_subject === "string" && fm.email_subject.trim() ? fm.email_subject.trim() : file.basename;
            names.set(fm.site_uid + ":" + fm.hakisend_acelle_campaign_uid, emailName);
          }
          if (snapshot.ignored)
            modal.contentEl.createEl("p", { text: snapshot.ignored + " yêu cầu không hợp lệ hoặc không thuộc tài khoản đã được bỏ qua." });
          if (!snapshot.intents.length)
            modal.contentEl.createEl("p", { text: "Chưa có yêu cầu gửi nào cần kiểm tra." });
          for (const intent of snapshot.intents) {
            const site = this.settings.sites.find((s) => s.uid === intent.siteUid);
            const title = names.get(intent.siteUid + ":" + intent.campaignUid) || "Email " + intent.campaignUid;
            const siteName = site?.name || "Trang web chưa xác định";
            const row = new import_obsidian.Setting(modal.contentEl).setName(title).setDesc(siteName + " · " + (intent.action === "send_now" ? "Gửi ngay" : "Đặt lịch") + " · Kiểm tra chỉ đọc");
            row.addButton((b) => b.setButtonText("Kiểm tra kết quả").onClick(async () => {
              b.setDisabled(true);
              try {
                if (!this.hasSecureConnection()) throw Error("Secure OAuth connection required.");
                const token = await this.getAccessToken();
                const result = await readR3Receipt(
                  (req) => (0, import_obsidian.requestUrl)(req),
                  normalizeBaseUrl(this.settings.apiBaseUrl),
                  intent,
                  token
                );
                await this.r3ApplyDeliveryState(intent, result).catch(() => {
                  new import_obsidian.Notice("Đã đọc kết quả HakiSend, nhưng chưa cập nhật được ghi chú.");
                });
                modal.contentEl.createEl("p", { text: title + " · " + siteName + " · " + r3DeliveryDisplay(result, intent).label });
              } catch (e) {
                await this.r3ApplyDeliveryState(intent, null).catch(() => {});
                new import_obsidian.Notice("Chưa đọc được kết quả cũ. Không gửi lại; cần đối chiếu trên HakiSend.");
              } finally {
                b.setDisabled(false);
              }
            }));
          }
          modal.open();
        } catch (e) {
          new import_obsidian.Notice("Cannot read persisted approval identities. DO NOT resend; reconcile locally.");
        }
      }
    });
    this.registerUserCommand({
      id: "r3-sync-current-email-delivery-status",
      name: "HakiSend: Cập nhật trạng thái gửi email",
      callback: async () => {
        await this.r3SyncActiveEmailStatus(true);
      }
    });
    this.registerUserCommand({
      id: "r3-toggle-email-technical-properties",
      name: "HakiSend: Hiện hoặc ẩn thông tin kỹ thuật email",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : null;
        if (!file?.path?.startsWith(ROOT2) || fm?.hakisend_type !== "email_campaign" || fm?.hakisend_email_kind !== "standalone") {
          new import_obsidian.Notice("Hãy mở một email HakiSend để thay đổi cách hiển thị.");
          return;
        }
        const before = this.settings.r3ShowEmailTechnicalProperties === true;
        this.settings.r3ShowEmailTechnicalProperties = !before;
        try {
          await this.saveSettings();
        } catch (e) {
          this.settings.r3ShowEmailTechnicalProperties = before;
          new import_obsidian.Notice("Chưa lưu được tùy chọn hiển thị.");
          return;
        }
        this.r3UpdateEmailPropertyVisibility();
        new import_obsidian.Notice(before ? "Đã thu gọn thông tin kỹ thuật. Nội dung email vẫn giữ nguyên." : "Đã hiện Properties để xem hoặc chỉnh sửa thông tin kỹ thuật.");
      }
    });
    this.registerUserCommand({
      id: "r3-simplify-current-email-note",
      name: "HakiSend: Làm gọn ghi chú email đang mở",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file?.path?.startsWith(ROOT2) || file.extension !== "md") {
          new import_obsidian.Notice("Hãy mở một ghi chú email HakiSend trước.");
          return;
        }
        try {
          let changed = false;
          await this.app.vault.process(file, (latest) => {
            const cached = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
            const fields = localEmailFieldsFromRaw(latest, cached);
            if (fields.hakisend_type !== "email_campaign" || fields.hakisend_email_kind !== "standalone")
              throw Error("Ghi chú này không phải email thông thường.");
            const next = simplifyStandaloneEmailNote(latest, fields);
            changed = next !== latest;
            return next;
          });
          new import_obsidian.Notice(changed ? "Đã làm gọn ghi chú và giữ nguyên nội dung email." : "Ghi chú đã ở dạng gọn.");
        } catch (e) {
          new import_obsidian.Notice("Chưa làm gọn vì chưa xác minh được ranh giới nội dung email. Ghi chú được giữ nguyên.");
        }
      }
    });
    this.registerUserCommand({
      id: "inspect-email-delivery-readiness",
      name: "HakiSend: Inspect Publisher R3 Native Preflight (read-only)",
      callback: async () => {
        await this.openManualDeliveryReadiness();
      }
    });
    this.registerUserCommand({
      id: "inspect-native-email-delivery-evidence-readonly",
      name: "HakiSend: Inspect Acelle Send/Bounce Evidence (GET only)",
      callback: async () => {
        await this.inspectNativeDeliveryEvidenceReadOnly();
      }
    });
    this.registerUserCommand({
      id: "inspect-native-email-schedule-readonly",
      name: "HakiSend: Inspect Native Acelle Email Schedule (GET only)",
      callback: async () => {
        await this.inspectNativeEmailScheduleReadOnly();
      }
    });
    this.registerUserCommand({
      id: "view-unified-calendar-readonly",
      name: "HakiSend: View Unified Calendar (read-only candidate)",
      callback: () => {
        new HakiSendReadOnlyCalendarModal(
          this.app,
          this.settings.sites,
          async (siteUid) => {
            const token = await this.getAccessToken();
            if (!token || !this.hasSecureConnection()) throw Error("OAuth required.");
            const request2 = buildCalendarReadRequest(
              normalizeBaseUrl(this.settings.apiBaseUrl),
              siteUid,
              token,
              50
            );
            const response = await (0, import_obsidian.requestUrl)({ ...request2, throw: false });
            if (response.status !== 200) throw Error("Calendar read unavailable.");
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
            return validateHakiSendCalendar(response.json, siteUid, tz);
          }
        ).open();
      }
    });
    this.registerUserCommand({
      id: "view-unified-calendar-paged-readonly",
      name: "HakiSend: View Paged Calendar v2 (read-only candidate)",
      callback: () => {
        new HakiSendPagedCalendarModal(
          this.app,
          this.settings.sites,
          async (siteUid, cursor) => {
            const token = await this.getAccessToken();
            if (!token || !this.hasSecureConnection()) throw Error("OAuth required.");
            const request2 = buildCalendarPageRequest(
              normalizeBaseUrl(this.settings.apiBaseUrl),
              siteUid,
              token,
              50,
              cursor
            );
            const response = await (0, import_obsidian.requestUrl)({ ...request2, throw: false });
            if (response.status !== 200) throw Error("Calendar page unavailable.");
            return response.json;
          }
        ).open();
      }
    });
    this.registerUserCommand({
      id: "browse-private-email-drafts",
      name: "HakiSend: Browse Private Email Drafts (read-only)",
      callback: () => {
        new HakiSendPrivateEmailBrowserModal(
          this.app,
          this.settings.sites,
          async (siteUid) => {
            const token = await this.getAccessToken();
            if (!token) throw Error("Connection required.");
            const data2 = await requestPrivateDraft(
              (request2) => (0, import_obsidian.requestUrl)(request2),
              normalizeBaseUrl(this.settings.apiBaseUrl),
              siteUid,
              token,
              "drafts",
              "GET"
            );
            return parsePrivateDraftList(data2);
          },
          async (siteUid, draftUid) => {
            const token = await this.getAccessToken();
            if (!token) throw Error("Connection required.");
            const data2 = await requestPrivateDraft(
              (request2) => (0, import_obsidian.requestUrl)(request2),
              normalizeBaseUrl(this.settings.apiBaseUrl),
              siteUid,
              token,
              "drafts/" + draftUid,
              "GET"
            );
            return parsePrivateDraftDetail(data2, draftUid);
          }
        ).open();
      }
    });
    this.registerUserCommand({
      id: "show-local-status",
      name: "HakiSend: Show Local Status",
      callback: async () => {
        await this.showCurrentPostStatus();
      }
    });
    this.settingTab = new HakiSendPublisherSettingTab(
      this.app,
      this
    );
    this.addSettingTab(this.settingTab);
  }
  /** Existing concrete native APIs; pinned delivery cannot use a different Campaign. */
  createR3NativeDeliveryModal(pinned) {
    return new HakiSendR3NativeDeliveryModal(
      this.app,
      this.settings.sites,
      async (site) => {
        const token = await this.getAccessToken();
        if (!this.hasSecureConnection()) throw Error("Secure OAuth required");
        return fetchR3Campaigns(
          (req) => (0, import_obsidian.requestUrl)(req),
          normalizeBaseUrl(this.settings.apiBaseUrl),
          site,
          token
        );
      },
      async (site, campaign2) => {
        const token = await this.getAccessToken();
        if (!this.hasSecureConnection()) throw Error("Secure OAuth required");
        return fetchR3Preflight(
          (req) => (0, import_obsidian.requestUrl)(req),
          normalizeBaseUrl(this.settings.apiBaseUrl),
          site,
          campaign2,
          token
        );
      },
      (site, campaign2) => this.r3PendingDelivery(site, campaign2),
      async (site, campaign2, action, p) => {
        var _a, _b, _c;
        const token = await this.getAccessToken();
        if (!token || !this.hasSecureConnection())
          throw Error("Secure OAuth required");
        const origin = normalizeBaseUrl(this.settings.apiBaseUrl);
        if (pinned) {
          const active = this.app.workspace.getActiveFile();
          if (!active || active.path !== pinned.notePath || site !== pinned.site || campaign2 !== pinned.campaign)
            throw Error("The Email Only source changed. No delivery submitted.");
          const raw = await this.app.vault.read(active);
          const fm = localEmailFieldsFromRaw(raw, (_b = (_a = this.app.metadataCache.getFileCache(active)) == null ? void 0 : _a.frontmatter) != null ? _b : {});
          const local = parseStandalonePlan(active, fm, raw);
          const promotionUid = fm.hakisend_acelle_promotion_request_uid;
          if (local.siteUid !== site || fm.hakisend_acelle_campaign_uid !== campaign2 || fm.hakisend_acelle_campaign_status !== "new_draft_not_sent" || !local.draftUid || !local.revision || typeof promotionUid !== "string")
            throw Error("Email Campaign no longer matches verified local source.");
          const remoteDraft = await requestPrivateDraft(
            (req) => (0, import_obsidian.requestUrl)(req),
            origin,
            site,
            token,
            "drafts/" + local.draftUid,
            "GET"
          );
          const promotionReceipt = await requestPromotion(
            (req) => (0, import_obsidian.requestUrl)(req),
            origin,
            site,
            local.draftUid,
            promotionUid,
            token,
            "GET"
          );
          verifyPinnedEmailSource(
            local,
            campaign2,
            promotionUid,
            remoteDraft,
            promotionReceipt
          );
          if (await this.app.vault.read(active) !== raw || ((_c = this.app.workspace.getActiveFile()) == null ? void 0 : _c.path) !== pinned.notePath)
            throw Error("Email Plan edited while checking remote state. No send submitted.");
        }
        const verifiedDelivery = await sendR3Once(
          (req) => (0, import_obsidian.requestUrl)(req),
          origin,
          site,
          campaign2,
          token,
          action,
          p,
          (intent) => this.r3PersistIntent(intent)
        );
        const intent = { siteUid: site, campaignUid: campaign2, requestUid: p.request_uid, action };
        try {
          await this.r3ApplyDeliveryState(intent, verifiedDelivery, pinned?.notePath || "");
        } catch (e) {
          new import_obsidian.Notice("HakiSend đã nhận yêu cầu. Ghi chú chưa cập nhật; có thể chọn 'Cập nhật trạng thái gửi email' sau.");
        }
        return verifiedDelivery;
      },
      async (intent) => {
        const token = await this.getAccessToken();
        if (!this.hasSecureConnection()) throw Error("Secure OAuth required");
        const verifiedDelivery = await readR3Receipt(
          (req) => (0, import_obsidian.requestUrl)(req),
          normalizeBaseUrl(this.settings.apiBaseUrl),
          intent,
          token
        );
        await this.r3ApplyDeliveryState(intent, verifiedDelivery, pinned?.notePath || "").catch(() => {});
        return verifiedDelivery;
      },
      pinned ? { site: pinned.site, campaign: pinned.campaign } : void 0
    );
  }
  /**
   * Import an independent Markdown email into the EXISTING Standalone Plan.
   * This stage has only one Vault CREATE operation; no server mutation.
   */
  async loadAuthorizedEmailListsForLocalPlan(siteUid) {
    if (!this.settings.sites.some((site) => site.uid === siteUid)) throw Error("Selected Site is not authorized.");
    if (!this.hasSecureConnection()) throw Error("Secure OAuth Email connection required.");
    const token = await this.getAccessToken();
    if (!token) throw Error("Secure OAuth Email access token unavailable.");
    return await requestPrivateDraft(
      (req) => (0, import_obsidian.requestUrl)(req),
      normalizeBaseUrl(this.settings.apiBaseUrl),
      siteUid,
      token,
      "audiences",
      "GET"
    );
  }
  async loadPostNoticeAudiencesForSite(siteUid, postUid) {
    if (!validUuid(postUid)) throw Error("Hãy chờ xác nhận UID của Post gốc.");
    if (!this.settings.sites.some((site) => site.uid === siteUid)) throw Error("Site không được kết nối.");
    if (!this.hasSecureConnection()) throw Error("Cần kết nối OAuth HakiSend.");
    const token = await this.getAccessToken();
    if (!token) throw Error("Không có OAuth token hợp lệ.");
    const response = await requestPrivateDraft(
      (req) => (0, import_obsidian.requestUrl)(req),
      normalizeBaseUrl(this.settings.apiBaseUrl), siteUid, token,
      "audiences?post_uid=" + postUid.toLowerCase(), "GET"
    );
    if (!response || response.guard_ready !== true || response.post_uid !== postUid.toLowerCase() ||
      !Array.isArray(response.items) || !response.items.every((x) => isAudience(x) && typeof x.post_notice_reserved === "boolean")) {
      throw Error("HakiSend chưa bật sổ chống gửi trùng theo Post + List. Cập nhật Publisheremail 0.6.19 và Sites 0.15.22 trước khi tiếp tục.");
    }
    return response.items;
  }
  async openR3EmailOnlyImport() {
    var _a, _b;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new import_obsidian.Notice("Open an independent Markdown email note.");
      return;
    }
    const original = await this.app.vault.read(file);
    try {
      validateEmailOnlySource(original, file.path);
    } catch (e) {
      new import_obsidian.Notice("Email Only blocked: " + String(e).slice(0, 150));
      return;
    }
    const sites = this.settings.sites;
    if (!sites.length) {
      new import_obsidian.Notice("Connect at least one HakiSend Site.");
      return;
    }
    const sourceFields = (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {};
    const pinned = typeof sourceFields.site_uid === "string" ? sourceFields.site_uid : "";
    const defaultSite = sites.some((s) => s.uid === pinned) ? pinned : sites.some((s) => s.uid === this.settings.defaultSiteUid) ? this.settings.defaultSiteUid : sites[0].uid;
    if (pinned && pinned !== defaultSite) {
      new import_obsidian.Notice("The Markdown source is pinned to an unavailable Site.");
      return;
    }
    let site = defaultSite, subject = file.basename, preheader = "", list = "", audiences = [];
    let siteRevision = 0, busy = false;
    const modal = new import_obsidian.Modal(this.app);
    const c = modal.contentEl;
    c.empty();
    modal.titleEl.setText("Email Only \u2014 Prepare Verified Workflow");
    c.createEl("p", { text: "Copy the COMPLETE independent Markdown into a Standalone Email Plan. No Website Post or remote Campaign is created by this step." });
    new import_obsidian.Setting(c).setName("HakiSend Site (owner; not a Post)").addDropdown((d) => {
      for (const row of sites) d.addOption(row.uid, row.name);
      d.setValue(site).onChange((v) => {
        site = v;
        list = "";
        audiences = [];
        siteRevision++;
        if (pinned && pinned !== v) new import_obsidian.Notice("Source Site is pinned; cannot import to a different Site.");
      });
    });
    new import_obsidian.Setting(c).setName("Email subject").addText((t) => t.setValue(subject).onChange((v) => {
      subject = v;
    }));
    new import_obsidian.Setting(c).setName("Preview text (optional)").addText((t) => t.setValue(preheader).onChange((v) => {
      preheader = v;
    }));
    const listArea = c.createDiv();
    const renderLists = () => {
      listArea.empty();
      if (!audiences.length) {
        listArea.createEl("p", { text: "Load authorized Email Lists to select the recipient audience." });
        return;
      }
      new import_obsidian.Setting(listArea).setName("Authorized Email List").addDropdown((d) => {
        d.addOption("", "Choose an authorized List");
        for (const row of audiences) d.addOption(row.uid, row.name);
        d.setValue(list);
        d.onChange((v) => {
          list = v;
        });
      });
    };
    renderLists();
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Load authorized Lists (GET)").onClick(async () => {
      const activeSite = site, rev = ++siteRevision;
      b.setDisabled(true);
      try {
        if (!this.hasSecureConnection()) throw Error("Secure OAuth Email connection required.");
        const token = await this.getAccessToken();
        const result = await requestPrivateDraft(
          (req) => (0, import_obsidian.requestUrl)(req),
          normalizeBaseUrl(this.settings.apiBaseUrl),
          activeSite,
          token,
          "audiences",
          "GET"
        );
        if (rev !== siteRevision || site !== activeSite) return;
        if (!Array.isArray(result) || result.length > 500 || !result.every(isAudience))
          throw Error("Unverified HakiSend List response.");
        audiences = result;
        list = "";
        renderLists();
      } catch (e) {
        new import_obsidian.Notice("Email List lookup unavailable or unauthorized.");
      } finally {
        b.setDisabled(false);
      }
    }));
    new import_obsidian.Setting(c).addButton((b) => b.setButtonText("Create Standalone Email Plan in Vault").setCta().onClick(async () => {
      if (busy) return;
      busy = true;
      b.setDisabled(true);
      try {
        if (!audiences.some((x) => x.uid === list) || !list)
          throw Error("Choose a currently authorized Email List.");
        if (pinned && pinned !== site) throw Error("Pinned source Site differs.");
        if (!this.settings.sites.some((s) => s.uid === site))
          throw Error("This HakiSend Site is no longer authorized.");
        const active = this.app.workspace.getActiveFile();
        if (!active || active.path !== file.path || await this.app.vault.read(file) !== original)
          throw Error("Source note changed. Reopen import to review.");
        const plan = createEmailOnlyPlanFromMarkdown({
          siteUid: site,
          listUid: list,
          subject,
          preheader,
          originalPath: file.path,
          sourceMarkdown: original
        });
        const paths = localEmailPlanPaths(site, "standalone", subject);
        if (!this.app.vault.getAbstractFileByPath(paths.root))
          await this.app.vault.createFolder(paths.root);
        if (!this.app.vault.getAbstractFileByPath(paths.directory))
          await this.app.vault.createFolder(paths.directory);
        let created = null;
        for (let n = 1; n <= 1e3; n++) {
          const name = paths.directory + "/" + paths.basename + (n === 1 ? "" : " (" + n + ")") + ".md";
          if (this.app.vault.getAbstractFileByPath(name)) continue;
          created = await this.app.vault.create(name, plan.planMarkdown);
          break;
        }
        if (!created) throw Error("No free filename for Standalone Email.");
        modal.close();
        await this.app.workspace.getLeaf(true).openFile(created);
        new import_obsidian.Notice("Complete Email Only content prepared; nothing sent.");
        await this.openR3EmailOnlyLifecycle();
      } catch (err) {
        new import_obsidian.Notice("Email Only not prepared: " + String(err).slice(0, 160));
      } finally {
        busy = false;
        b.setDisabled(false);
      }
    }));
    modal.open();
  }
  /**
   * One Obsidian entry point for the real four existing API-backed actions.
   * Each write continues to use its original review/confirmation modal.
   * Pending request IDs cannot be silently retried.
   */
  async openR3EmailOnlyLifecycle() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new import_obsidian.Notice("Hãy mở bản nháp email cần gửi trước.");
      return;
    }
    new HakiSendR3EmailWizardModal(this.app, this, file.path).open();
  }
  /** The only primary Email button: create from other notes, continue from a draft. */
  async openR3SimpleEmailEntry() {
    const create = () => new HakiSendLocalEmailPlannerModal(
      this.app,
      this.settings.sites,
      this.settings.defaultSiteUid,
      (siteUid) => this.loadAuthorizedEmailListsForLocalPlan(siteUid)
    ).open();
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md" || !file.path.startsWith(ROOT2)) {
      create();
      return;
    }
    try {
      const raw = await this.app.vault.read(file);
      const cached = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      const fields = localEmailFieldsFromRaw(raw, cached);
      const mode = r3SimpleEmailEntryMode(file, fields);
      if (this.app.workspace.getActiveFile()?.path !== file.path) {
        new import_obsidian.Notice("Ghi chú đang mở đã thay đổi. Hãy nhấn nút Email HakiSend lần nữa.");
      } else if (mode === "create") {
        create();
      } else if (mode === "other_email") {
        new import_obsidian.Notice("Đây là email liên kết bài viết. Hãy dùng quy trình gửi theo bài viết.");
      } else if (mode === "submitted") {
        new import_obsidian.Notice("Email này đã được HakiSend tiếp nhận để gửi hoặc đặt lịch. Không gửi lại. Hãy tạo email mới nếu cần.");
      } else {
        await this.openR3EmailOnlyLifecycle();
      }
    } catch (e) {
      new import_obsidian.Notice("Chưa mở được email. Ghi chú được giữ nguyên; hãy kiểm tra thông tin email trước khi thử lại.");
    }
  }
  /**
   * A previously persisted but response-lost Private Draft creation is
   * recovered by GET index + exact GET detail. Zero POSTs are performed.
   * The original request UID remains stable even if recovery fails.
   */
  async recoverR3EmailOnlyPrivateDraft() {
    var _a, _b;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new import_obsidian.Notice("Open the original pending Standalone Email Plan.");
      return;
    }
    try {
      const raw = await this.app.vault.read(file);
      const fields = { ...localEmailFieldsFromRaw(raw, (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {}) };
      const plan = parseStandalonePlan(file, fields, raw);
      if (!plan.requestUid || plan.draftUid || !this.settings.sites.some((s) => s.uid === plan.siteUid))
        throw Error("Only an authorized pending request can be recovered.");
      const token = await this.getAccessToken();
      if (!token || !this.hasSecureConnection())
        throw Error("Secure OAuth is required.");
      const requester = (suffix) => requestPrivateDraft(
        (req) => (0, import_obsidian.requestUrl)(req),
        normalizeBaseUrl(this.settings.apiBaseUrl),
        plan.siteUid,
        token,
        suffix,
        "GET"
      );
      const remoteIndex = await requester("drafts");
      const draftUid = locateDraftForRecovery(remoteIndex, plan);
      const remoteDetail = await requester("drafts/" + draftUid);
      const verified = verifyRecoveredPrivateDraft(remoteDetail, plan, draftUid);
      if (await this.app.vault.read(file) !== raw)
        throw Error("Email Plan changed during GET verification.");
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        var _a2, _b2;
        if (fm.site_uid !== plan.siteUid || fm.email_subject !== plan.subject || ((_a2 = fm.email_preheader) != null ? _a2 : "") !== plan.preheader || fm.email_list_uid !== plan.listUid || fm.hakisend_remote_email_request_uid !== plan.requestUid || !!fm.hakisend_remote_email_draft_uid || ((_b2 = fm.hakisend_remote_email_revision) != null ? _b2 : null) !== null)
          throw Error("Local request identity changed during recovery.");
        fm.hakisend_remote_email_draft_uid = verified.uid;
        fm.hakisend_remote_email_revision = verified.revision;
        fm.hakisend_remote_email_status = "private_draft";
      });
      await this.app.vault.process(file, (latest) => {
        if (extractStandaloneEmailBody(latest) !== plan.body)
          throw Error("Email body changed after remote receipt recovery.");
        return decorateLocalPlan(latest, verified.revision);
      });
      new import_obsidian.Notice("Private Draft recovered by GET. No new Campaign and no email sent.");
    } catch (error) {
      new import_obsidian.Notice("GET-only recovery blocked: " + String(error).slice(0, 140) + ". Do NOT retry POST.");
    }
  }
  async openManualPrivateDraftSave(wizard = null) {
    var _a, _b;
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== "md") throw Error("Open a Standalone Email Plan.");
      const originalRaw = await this.app.vault.read(file);
      const fields = { ...localEmailFieldsFromRaw(originalRaw, (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {}) };
      const plan = parseStandalonePlan(file, fields, originalRaw);
      if (!this.settings.sites.some((s) => s.uid === plan.siteUid)) {
        throw Error("Email Site is not in the connected account's Site list.");
      }
      const token = await this.getAccessToken();
      if (!token || !this.hasSecureConnection()) throw Error("Secure OAuth Email connection required.");
      const apiOrigin = normalizeBaseUrl(this.settings.apiBaseUrl);
      const requester = (suffix, method = "GET", payload) => requestPrivateDraft(
        (req) => (0, import_obsidian.requestUrl)(req),
        apiOrigin,
        plan.siteUid,
        token,
        suffix,
        method,
        payload
      );
      const rawAudiences = await requester("audiences");
      if (!Array.isArray(rawAudiences) || rawAudiences.length > 500 || !rawAudiences.every(isAudience)) {
        throw Error("Cannot verify available Email audiences.");
      }
      const audiences = rawAudiences;
      const saveModal = new HakiSendManualDraftSaveModal(this.app, plan, audiences, async (chosenListUid) => {
        if (await this.app.vault.read(file) !== originalRaw) {
          throw Error("Local note changed since the save confirmation opened.");
        }
        const newUid = plan.requestUid || uuidV4();
        try {
          await explicitlySavePrivateDraft({
            plan,
            authorizedAudiences: audiences,
            selectedAudienceUid: chosenListUid,
            newRequestUid: newUid,
            io: {
              persistCreateIdentity: async (requestUid, audienceUid) => {
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                  var _a2;
                  if (fm.site_uid !== plan.siteUid || fm.email_subject !== plan.subject || ((_a2 = fm.email_preheader) != null ? _a2 : "") !== plan.preheader || !!fm.hakisend_remote_email_draft_uid || fm.hakisend_remote_email_request_uid && fm.hakisend_remote_email_request_uid !== requestUid || fm.email_list_uid && fm.email_list_uid !== audienceUid) {
                    throw Error("Local Email identity changed.");
                  }
                  fm.hakisend_remote_email_request_uid = requestUid;
                  fm.email_list_uid = audienceUid;
                });
              },
              getRemoteDraft: (uid3) => requester("drafts/" + uid3),
              mutateRemote: (m) => requester(m.suffix, m.method, m.payload),
              persistVerifiedReceipt: async (verified) => {
                const currentRaw = await this.app.vault.read(file);
                if (extractStandaloneEmailBody(currentRaw) !== plan.body) {
                  throw Error("Local note body changed; server must be reviewed manually.");
                }
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                  var _a2;
                  if (fm.site_uid !== plan.siteUid || fm.email_subject !== plan.subject || ((_a2 = fm.email_preheader) != null ? _a2 : "") !== plan.preheader || fm.email_list_uid !== chosenListUid || (plan.draftUid ? fm.hakisend_remote_email_draft_uid !== plan.draftUid || fm.hakisend_remote_email_revision !== plan.revision : fm.hakisend_remote_email_request_uid !== newUid || !!fm.hakisend_remote_email_draft_uid)) {
                    throw Error("Local Email metadata changed during HTTP save.");
                  }
                  fm.hakisend_remote_email_draft_uid = verified.uid;
                  fm.hakisend_remote_email_revision = verified.revision;
                  fm.hakisend_remote_email_status = "private_draft";
                });
                await this.app.vault.process(file, (raw) => {
                  if (extractStandaloneEmailBody(raw) !== plan.body) {
                    throw Error("Local Markdown changed while updating verified callout.");
                  }
                  return decorateLocalPlan(raw, verified.revision);
                });
              }
            }
          });
        } catch (error) {
          if (isRevisionConflict(error) && !!plan.draftUid) {
            let remote;
            try {
              remote = parsePrivateDraftDetail(
                await requester("drafts/" + plan.draftUid),
                plan.draftUid
              );
            } catch (e) {
              throw error;
            }
            new HakiSendManualDraftConflictModal(this.app, plan, remote, async () => {
              const fresh = parsePrivateDraftDetail(
                await requester("drafts/" + plan.draftUid),
                plan.draftUid
              );
              const acceptedRevision = verifyManualConflictAdoption(
                plan,
                remote,
                fresh
              );
              const currentRaw = await this.app.vault.read(file);
              extractStandaloneEmailBody(currentRaw);
              await this.app.vault.process(file, (raw) => {
                if (raw !== currentRaw) {
                  throw Error("Local Markdown changed during conflict adoption.");
                }
                return markManualConflictPending(raw, acceptedRevision);
              });
              await this.app.fileManager.processFrontMatter(file, (fm) => {
                if (fm.site_uid !== plan.siteUid || fm.hakisend_remote_email_draft_uid !== plan.draftUid || fm.hakisend_remote_email_revision !== plan.revision || fm.hakisend_remote_email_status !== "private_draft" || fm.email_list_uid !== chosenListUid) {
                  throw Error("Local Draft identity changed.");
                }
                fm.hakisend_remote_email_revision = acceptedRevision;
                fm.hakisend_remote_email_status = "conflict_reviewed";
              });
            }).open();
          }
          throw error;
        }
      }, wizard ? () => wizard.showCurrentStage() : null, wizard ? () => wizard.showCurrentStage() : null);
      if (wizard) saveModal.renderInto(wizard.contentEl);
      else saveModal.open();
    } catch (e) {
      new import_obsidian.Notice("Standalone Private Draft unavailable. Open a valid Email Plan and verify your secure connection and Site permissions.");
    }
  }
  /**
   * Manual, no-write Acelle schedule diagnostic for an already promoted
   * Standalone Email Plan. This is NOT a permission to schedule or send,
   * nor provider/queue receipt verification. The remote feature is OFF.
   */
  /**
   * User-invoked, read-only Acelle per-message summary. A logged "sent"
   * status is NOT provider/inbox delivery. Do not expose recipients,
   * message IDs, or use this to auto-update local send status.
   */
  async inspectNativeDeliveryEvidenceReadOnly() {
    var _a;
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== "md")
        throw Error("Open a Standalone Email Plan.");
      const fm = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
      if (!fm || fm.hakisend_type !== "email_campaign" || fm.hakisend_email_kind !== "standalone")
        throw Error("A saved Standalone Email Plan is required.");
      const siteUid = fm.site_uid;
      const campaignUid = fm.hakisend_acelle_campaign_uid;
      if (typeof siteUid !== "string" || typeof campaignUid !== "string" || !this.settings.sites.some((s) => s.uid === siteUid))
        throw Error("Plan is missing owned Site or verified Acelle Campaign UID.");
      const token = await this.getAccessToken();
      if (!token || !this.hasSecureConnection())
        throw Error("Secure OAuth Email read access required.");
      const request2 = buildNativeDeliveryEvidenceGet(
        normalizeBaseUrl(this.settings.apiBaseUrl),
        siteUid,
        campaignUid,
        token
      );
      const response = await (0, import_obsidian.requestUrl)(request2);
      if (response.status !== 200)
        throw Error("HakiSend has not enabled this read-only diagnostic.");
      const evidence = parseNativeDeliveryEvidence(
        response.json,
        siteUid,
        campaignUid
      );
      const modal = new import_obsidian.Modal(this.app);
      modal.titleEl.setText("Acelle send evidence \xB7 read-only");
      modal.contentEl.createEl("p", { text: "Campaign: " + evidence.campaignUid + " \xB7 Site: " + evidence.siteUid });
      modal.contentEl.createEl("p", { text: "Acelle native status: " + evidence.campaignNativeStatus + " \xB7 Internal ledger: " + evidence.ledgerStatus + " (revision " + evidence.ledgerRevision + ")" });
      modal.contentEl.createEl("p", { text: "Acelle recorded sent: " + evidence.acelleRecordedSent + " \xB7 failed: " + evidence.acelleRecordedFailed + " \xB7 duplicates: " + evidence.acelleRecordedDuplicate });
      modal.contentEl.createEl("p", { text: "Tracked with bounce: " + evidence.trackedWithBounce + " \xB7 complaint: " + evidence.trackedWithComplaint });
      if (evidence.unexpectedNativeActivity) {
        modal.contentEl.createEl("p", { text: "WARNING: Acelle has message logs while HakiSend's ledger is unhanded or cancelled. Manual reconciliation required." });
      }
      modal.contentEl.createEl("p", { text: evidence.disclosure });
      modal.contentEl.createEl("p", { text: "No subscribers, messages, Campaign status, schedule or provider records were changed." });
      modal.open();
    } catch (e) {
      new import_obsidian.Notice("Acelle send evidence unavailable, not authorized, or the server feature is still OFF. No email action taken.");
    }
  }
  async inspectNativeEmailScheduleReadOnly() {
    var _a;
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== "md")
        throw Error("Open an existing Standalone Email Plan.");
      const fm = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
      if (!fm || fm.hakisend_type !== "email_campaign" || fm.hakisend_email_kind !== "standalone")
        throw Error("Choose a Standalone Email Plan.");
      const siteUid = fm.site_uid;
      const campaignUid = fm.hakisend_acelle_campaign_uid;
      if (typeof siteUid !== "string" || typeof campaignUid !== "string" || !this.settings.sites.some((s) => s.uid === siteUid))
        throw Error("This Plan has no owned Site or verified Acelle Campaign draft.");
      const token = await this.getAccessToken();
      if (!token || !this.hasSecureConnection())
        throw Error("Secure OAuth Email connection required.");
      const request2 = buildNativeScheduleDiagnosticRequest(
        normalizeBaseUrl(this.settings.apiBaseUrl),
        siteUid,
        campaignUid,
        token
      );
      const response = await (0, import_obsidian.requestUrl)(request2);
      if (response.status !== 200)
        throw Error("The server native schedule diagnostic is not enabled or access was denied.");
      const detail = parseNativeScheduleDiagnostic(
        response.json,
        siteUid,
        campaignUid
      );
      const modal = new import_obsidian.Modal(this.app);
      modal.titleEl.setText("Native Acelle Email Schedule \u2014 read-only");
      modal.contentEl.createEl("p", { text: "Site: " + detail.siteUid + " \xB7 Campaign: " + detail.campaignUid });
      modal.contentEl.createEl("p", { text: "Native state: " + detail.status });
      modal.contentEl.createEl("p", { text: detail.message });
      modal.contentEl.createEl("p", { text: "Ledger revision: " + (detail.ledgerRevision === null ? "none" : String(detail.ledgerRevision)) });
      modal.contentEl.createEl("p", { text: "No verified provider receipt, schedule or send authorization. Nothing changed." });
      modal.open();
    } catch (e) {
      new import_obsidian.Notice("Native Email schedule read unavailable, unauthorized, or still disabled on HakiSend. Nothing was sent or scheduled.");
    }
  }
  async promotionContext() {
    var _a, _b;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") throw Error("Open a saved Standalone Email Plan.");
    const raw = await this.app.vault.read(file);
    const fields = { ...localEmailFieldsFromRaw(raw, (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {}) };
    const plan = parseStandalonePlan(file, fields, raw);
    if (!plan.draftUid || !plan.revision || fields.hakisend_remote_email_status !== "private_draft") {
      throw Error("Save and verify your remote Private Draft first.");
    }
    if (!this.settings.sites.some((site) => site.uid === plan.siteUid)) {
      throw Error("The selected Site is not connected to this account.");
    }
    const token = await this.getAccessToken();
    if (!token || !this.hasSecureConnection()) throw Error("Secure OAuth required.");
    return {
      file,
      raw,
      plan,
      fields,
      token,
      origin: normalizeBaseUrl(this.settings.apiBaseUrl)
    };
  }
  async persistPromotionReceipt(file, plan, requestUid, receipt2) {
    const raw = await this.app.vault.read(file);
    if (extractStandaloneEmailBody(raw) !== plan.body) {
      throw Error("Local Markdown changed; server Campaign may exist. No overwrite.");
    }
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      var _a;
      if (fm.site_uid !== plan.siteUid || fm.hakisend_remote_email_draft_uid !== plan.draftUid || fm.hakisend_remote_email_revision !== plan.revision || fm.hakisend_remote_email_status !== "private_draft" || fm.email_subject !== plan.subject || ((_a = fm.email_preheader) != null ? _a : "") !== plan.preheader || fm.hakisend_acelle_promotion_request_uid !== requestUid || fm.hakisend_acelle_campaign_uid && fm.hakisend_acelle_campaign_uid !== receipt2.campaign_uid) {
        throw Error("Local source metadata changed after promotion.");
      }
      fm.hakisend_acelle_campaign_uid = receipt2.campaign_uid;
      fm.hakisend_acelle_campaign_status = "new_draft_not_sent";
    });
  }
  async openManualPrivateDraftPromotion(wizard = null) {
    try {
      const context = await this.promotionContext();
      const { file, raw, plan, fields, token, origin } = context;
      if (fields.hakisend_acelle_promotion_request_uid || fields.hakisend_acelle_campaign_uid) {
        throw Error("Existing promotion request: use receipt recovery, never another POST.");
      }
      const senderDefaults = await requestPrivateDraft(
        (req) => (0, import_obsidian.requestUrl)(req),
        origin,
        plan.siteUid,
        token,
        "drafts/" + plan.draftUid + "/sender-defaults",
        "GET"
      );
      if (!senderDefaults || senderDefaults.source !== "authorized_list_sender_defaults_v1" ||
          senderDefaults.site_uid !== plan.siteUid ||
          senderDefaults.private_draft_uid !== plan.draftUid ||
          senderDefaults.list_uid !== plan.listUid ||
          senderDefaults.revision !== plan.revision ||
          typeof senderDefaults.list_name !== "string" || !senderDefaults.list_name.trim() ||
          typeof senderDefaults.from_email !== "string" || !EMAIL.test(senderDefaults.from_email) ||
          typeof senderDefaults.from_name !== "string" || !senderDefaults.from_name.trim() ||
          typeof senderDefaults.reply_to !== "string" || !EMAIL.test(senderDefaults.reply_to) ||
          senderDefaults.sender_valid !== true || senderDefaults.sender_verified !== true) {
        throw Error("List sender defaults are incomplete, unverified, or do not match this Draft. Update the List in HakiSend.");
      }
      const promotionModal = new HakiSendManualPromotionModal(this.app, plan, senderDefaults, async (sender2) => {
        if (await this.app.vault.read(file) !== raw) {
          throw Error("Local note changed while confirmation was open.");
        }
        const uid3 = uuidV4();
        await explicitlyPromotePrivateDraft(plan, uid3, sender2, {
          getSourceDraft: (draftUid) => requestPrivateDraft(
            (req) => (0, import_obsidian.requestUrl)(req),
            origin,
            plan.siteUid,
            token,
            "drafts/" + draftUid,
            "GET"
          ),
          persistRequestUid: async (requestUid) => {
            if (await this.app.vault.read(file) !== raw) {
              throw Error("Local note changed during remote Draft verification.");
            }
            await this.app.fileManager.processFrontMatter(file, (fm) => {
              var _a;
              if (fm.site_uid !== plan.siteUid || fm.hakisend_remote_email_draft_uid !== plan.draftUid || fm.hakisend_remote_email_revision !== plan.revision || fm.hakisend_remote_email_status !== "private_draft" || fm.email_subject !== plan.subject || ((_a = fm.email_preheader) != null ? _a : "") !== plan.preheader || fm.hakisend_acelle_promotion_request_uid || fm.hakisend_acelle_campaign_uid) {
                throw Error("Promotion identity or source changed locally.");
              }
              fm.hakisend_acelle_promotion_request_uid = requestUid;
            });
          },
          submit: (requestUid, revision, from) => requestPromotion(
            (req) => (0, import_obsidian.requestUrl)(req),
            origin,
            plan.siteUid,
            plan.draftUid,
            requestUid,
            token,
            "POST",
            revision,
            from
          ),
          getReceipt: (requestUid) => requestPromotion(
            (req) => (0, import_obsidian.requestUrl)(req),
            origin,
            plan.siteUid,
            plan.draftUid,
            requestUid,
            token,
            "GET"
          ),
          persistVerifiedReceipt: (result) => this.persistPromotionReceipt(
            file,
            plan,
            uid3,
            result
          )
        });
      }, wizard ? () => wizard.showCurrentStage() : null, wizard ? () => wizard.showCurrentStage() : null);
      if (wizard) promotionModal.renderInto(wizard.contentEl);
      else promotionModal.open();
    } catch (e) {
      new import_obsidian.Notice("Promotion unavailable: " + String(e instanceof Error ? e.message : e).slice(0, 185) + ". No Campaign was created.", 12000);
    }
  }
  async recoverManualPrivatePromotion() {
    try {
      const { file, plan, fields, token, origin } = await this.promotionContext();
      const requestUid = fields.hakisend_acelle_promotion_request_uid;
      if (typeof requestUid !== "string" || !requestUid) {
        throw Error("No saved promotion request identity. Do not guess a new one.");
      }
      await explicitlyRecoverPrivatePromotion(plan, requestUid, {
        getReceipt: (uid3) => requestPromotion(
          (req) => (0, import_obsidian.requestUrl)(req),
          origin,
          plan.siteUid,
          plan.draftUid,
          uid3,
          token,
          "GET"
        ),
        persistVerifiedReceipt: (result) => this.persistPromotionReceipt(
          file,
          plan,
          requestUid,
          result
        )
      });
      new import_obsidian.Notice("Campaign Draft receipt verified on HakiSend. NOT sent or scheduled.");
    } catch (e) {
      new import_obsidian.Notice("No verified unsent Campaign receipt available. Nothing was sent or changed remotely; check HakiSend before taking another action.");
    }
  }
  async openManualDeliveryReadiness() {
    try {
      const { file, raw, plan, fields, origin, token } = await this.promotionContext();
      const requestUid = fields.hakisend_acelle_promotion_request_uid;
      const campaignUid = fields.hakisend_acelle_campaign_uid;
      if (typeof requestUid !== "string" || typeof campaignUid !== "string" || fields.hakisend_acelle_campaign_status !== "new_draft_not_sent") {
        throw Error("First create and verify the native Acelle Campaign Draft.");
      }
      const remoteDraft = await requestPrivateDraft(
        (req) => (0, import_obsidian.requestUrl)(req),
        origin,
        plan.siteUid,
        token,
        "drafts/" + plan.draftUid,
        "GET"
      );
      const promotionReceipt = await requestPromotion(
        (req) => (0, import_obsidian.requestUrl)(req),
        origin, plan.siteUid, plan.draftUid, requestUid, token, "GET"
      );
      verifyPinnedEmailSource(plan, campaignUid, requestUid, remoteDraft, promotionReceipt);
      const preflight = await fetchR3Preflight(
        (req) => (0, import_obsidian.requestUrl)(req),
        origin, plan.siteUid, campaignUid, token
      );
      const expectedChecks = [
        "site_audience", "source_content_integrity", "native_state",
        "campaign_permission", "native_setup", "sender", "unsubscribe",
        "native_recipient_count", "credit",
        "suppression_at_dispatch", "idempotent_delivery"
      ];
      if (expectedChecks.some((key) => !preflight.checks[key])) {
        throw Error("Server Preflight does not include all required technical and journal checks.");
      }
      if (preflight.siteUid !== plan.siteUid || preflight.campaign.uid !== campaignUid ||
          await this.app.vault.read(file) !== raw ||
          this.app.workspace.getActiveFile()?.path !== file.path) {
        throw Error("Email Plan changed while verifying native Preflight.");
      }
      new HakiSendR3ReadOnlyPreflightModal(this.app, preflight).open();
    } catch (e) {
      const reason = e instanceof Error ? e.message.slice(0, 160) : "Unknown read-only error";
      new import_obsidian.Notice("Publisher R3 Preflight unavailable: " + reason + ". No email was sent or scheduled.");
    }
  }
  async loadSettings() {
    var _a, _b;
    const stored = (_a = await this.loadData()) != null ? _a : {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      apiBaseUrl: storedApiBaseUrl(
        (_b = stored.apiBaseUrl) != null ? _b : DEFAULT_SETTINGS.apiBaseUrl
      ),
      sites: Array.isArray(stored.sites) ? stored.sites : [],
      sitePublicOrigins: stored.sitePublicOrigins && typeof stored.sitePublicOrigins === "object" && !Array.isArray(stored.sitePublicOrigins)
        ? Object.fromEntries(Object.entries(stored.sitePublicOrigins).filter(([site, origin]) => validUuid(site) && normalizePublicSiteOrigin(origin))) : {},
      cloudSyncAutoEnabled: stored.cloudSyncAutoEnabled === true,
      uiAdvancedCommands: stored.uiAdvancedCommands === true,
      cloudSyncBaselines: stored.cloudSyncBaselines && typeof stored.cloudSyncBaselines === "object" && !Array.isArray(stored.cloudSyncBaselines)
        ? stored.cloudSyncBaselines : {},
      folderSiteMappings: Array.isArray(stored.folderSiteMappings) ? stored.folderSiteMappings.filter((mapping) => {
        if (!mapping || typeof mapping !== "object") return false;
        const candidate = mapping;
        return typeof candidate.folderPath === "string" && !!normalizeFolderPath(candidate.folderPath) && typeof candidate.siteUid === "string" && !!candidate.siteUid.trim();
      }).map((mapping) => ({
        folderPath: normalizeFolderPath(mapping.folderPath),
        siteUid: mapping.siteUid.trim()
      })) : [],
      folderCategoryMappings: Array.isArray(stored.folderCategoryMappings) ? stored.folderCategoryMappings.filter((mapping) => {
        if (!mapping || typeof mapping !== "object") return false;
        const candidate = mapping;
        return typeof candidate.folderPath === "string" && !!normalizeFolderPath(candidate.folderPath) && typeof candidate.siteUid === "string" && !!candidate.siteUid.trim() && typeof candidate.categoryUid === "string" && !!candidate.categoryUid.trim();
      }).map((mapping) => ({
        folderPath: normalizeFolderPath(mapping.folderPath),
        siteUid: mapping.siteUid.trim(),
        categoryUid: mapping.categoryUid.trim(),
        categoryTitle: typeof mapping.categoryTitle === "string" ? mapping.categoryTitle : void 0
      })) : []
    };
  }
  async saveSettings() {
    await this.saveData(
      this.settings
    );
  }
  async cloudSyncEnsureFolder(path) {
    if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path);
  }
  async cloudSyncConflictCopy(doc) {
    const root = "HakiSend Sync Conflicts";
    const dir = root + "/" + doc.site_uid;
    await this.cloudSyncEnsureFolder(root);
    await this.cloudSyncEnsureFolder(dir);
    const filePath = dir + "/Email - " + safeFilename(doc.subject) +
      " - " + doc.uid.slice(0, 8) + " - revision-" + doc.revision + ".md";
    if (this.app.vault.getAbstractFileByPath(filePath)) return filePath;
    const warning = "# Phiên bản HakiSend cần đối chiếu\n\n" +
      "Email: " + doc.subject + "\n\n" +
      "Đây là bản sao chỉ đọc từ VPS. Ghi chú gốc trên thiết bị đã được giữ nguyên. " +
      "Hãy so sánh nội dung và chỉnh sửa bản nháp gốc theo ý muốn trước lần đồng bộ tiếp theo.\n\n" +
      "---\n\n" + doc.body_markdown;
    await this.app.vault.create(filePath, warning);
    return filePath;
  }
  async cloudSyncFindLocalIndex() {
    const index = new Map();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(ROOT2)) continue;
      let fm;
      try {
        fm = localEmailFieldsFromRaw(await this.app.vault.read(file), {});
      } catch (e) {
        continue;
      }
      if (fm.hakisend_email_kind !== "standalone" || !CLOUD_SYNC_UID.test(fm.site_uid || "") ||
        !CLOUD_SYNC_UID.test(fm.hakisend_remote_email_draft_uid || "")) continue;
      const key = cloudSyncKey(fm.site_uid, fm.hakisend_remote_email_draft_uid);
      const existing = index.get(key) || [];
      existing.push(file);
      index.set(key, existing);
    }
    return index;
  }
  async cloudSyncImport(doc, remoteHash, index, report) {
    await this.cloudSyncEnsureFolder("HakiSend Emails");
    const dir = "HakiSend Emails/" + doc.site_uid;
    await this.cloudSyncEnsureFolder(dir);
    const base2 = "Email - " + safeFilename(doc.subject);
    let path = dir + "/" + base2 + ".md";
    if (this.app.vault.getAbstractFileByPath(path))
      path = dir + "/" + base2 + " - " + doc.uid.slice(0, 8) + ".md";
    for (let suffix = 2; this.app.vault.getAbstractFileByPath(path); suffix++) {
      if (suffix > 99) throw Error("Too many Email path collisions; no files overwritten.");
      path = dir + "/" + base2 + " - " + doc.uid.slice(0, 8) + " - " + suffix + ".md";
    }
    const file = await this.app.vault.create(path, cloudSyncNote(doc, remoteHash));
    index.set(cloudSyncKey(doc.site_uid, doc.uid), [file]);
    this.settings.cloudSyncBaselines[cloudSyncKey(doc.site_uid, doc.uid)] = remoteHash;
    report.imported++;
  }
  async cloudSyncApply(doc, index, report, automatic) {
    const key = cloudSyncKey(doc.site_uid, doc.uid);
    const remoteHash = await cloudSyncHash(doc);
    const matches = index.get(key) || [];
    if (matches.length > 1) throw Error("Multiple local notes share one remote UID. Reconcile duplicates manually.");
    if (!matches.length) return await this.cloudSyncImport(doc, remoteHash, index, report);
    const file = matches[0];
    const original = await this.app.vault.read(file);
    const fields = localEmailFieldsFromRaw(original, {});
    if (fields.site_uid !== doc.site_uid ||
      fields.hakisend_remote_email_draft_uid !== doc.uid ||
      fields.hakisend_type !== "email_campaign" ||
      fields.hakisend_email_kind !== "standalone") {
      throw Error("Local Email identity mismatch. Nothing overwritten.");
    }
    const body = extractStandaloneEmailBody(original);
    const localHash = await cloudSyncHash({
      subject: fields.email_subject,
      preheader: fields.email_preheader || "",
      body
    });
    const baselineRaw = this.settings.cloudSyncBaselines[key] || fields.hakisend_sync_base_hash;
    const baseHash = /^[A-Za-z0-9_-]{43}$/.test(baselineRaw || "") ? baselineRaw : "";
    const isActive = this.app.workspace.getActiveFile()?.path === file.path;
    const localReadOnly = fields.hakisend_import_snapshot === true || fields.hakisend_read_only === true;
    if (fields.email_list_uid && fields.email_list_uid !== doc.list_uid) {
      await this.cloudSyncConflictCopy(doc);
      report.conflicts++;
      return;
    }
    const recordBaseline = () => {
      this.settings.cloudSyncBaselines[key] = remoteHash;
    };
    const revisionUpdates = {
      email_subject: doc.subject,
      email_preheader: doc.preheader,
      email_list_uid: doc.list_uid,
      hakisend_remote_email_revision: doc.revision,
      hakisend_sync_managed: true,
      hakisend_sync_base_hash: remoteHash,
      hakisend_sync_campaign_status: doc.campaign_status || ""
    };
    if (!doc.editable) Object.assign(revisionUpdates, {
      hakisend_import_snapshot: true,
      hakisend_read_only: true,
      email_dispatch_ready: true,
      hakisend_acelle_campaign_uid: doc.campaign_uid || "",
      hakisend_acelle_campaign_status: "synced_snapshot",
      hakisend_status: doc.campaign_status === "done" ? "email_completed" : "email_needs_review"
    });
    const safeUpdate = async (newBody) => {
      await this.app.vault.process(file, (current) => {
        if (current !== original) throw Error("Email changed during Cloud Sync; local note preserved.");
        const updated = newBody === void 0 ? current : cloudSyncReplaceBody(current, newBody);
        const withMetadata = cloudSyncUpsertYaml(updated, revisionUpdates);
        const finalText = cloudSyncRefreshCallout(withMetadata, doc);
        if (extractStandaloneEmailBody(finalText) !==
          (newBody === void 0 ? body : newBody.trim()))
          throw Error("Cloud Sync preserved original Email body; update was aborted.");
        return finalText;
      });
    };
    if (localHash === remoteHash) {
      // On first encounter an existing note is adopted only if its exact
      // authoring content matches the server, never by title/path alone.
      recordBaseline();
      if (!isActive && (!baseHash || fields.hakisend_remote_email_revision !== doc.revision ||
        fields.hakisend_sync_managed !== true || !doc.editable && (!localReadOnly ||
        fields.hakisend_sync_campaign_status !== (doc.campaign_status || "") ||
        fields.hakisend_acelle_campaign_uid !== (doc.campaign_uid || "")))) {
        await safeUpdate();
      }
      report.unchanged++;
      return;
    }
    if (!baseHash) {
      await this.cloudSyncConflictCopy(doc);
      report.conflicts++;
      return;
    }
    if (baseHash === localHash) {
      // Server changed while this device remained clean. Never overwrite an
      // actively open note; its editor may still have unsaved buffer changes.
      if (isActive) {
        report.deferred++;
        return;
      }
      await safeUpdate(doc.body_markdown);
      recordBaseline();
      report.downloaded++;
      return;
    }
    if (baseHash === remoteHash && doc.editable && !localReadOnly) {
      if (automatic && isActive) {
        report.deferred++;
        return;
      }
      // Confirm the file is still exactly the one whose body was hashed.
      if (await this.app.vault.read(file) !== original) {
        report.deferred++;
        return;
      }
      const origin = normalizeBaseUrl(this.settings.apiBaseUrl);
      const token = await this.getAccessToken();
      let accepted;
      try {
        const response = await cloudSyncApi(origin, doc.site_uid, token, "emails/" + doc.uid, "PUT", {
          revision: doc.revision,
          subject: fields.email_subject,
          preheader: fields.email_preheader || "",
          body_markdown: body
        });
        accepted = cloudSyncValidateDetail(response, doc.site_uid, doc.uid);
      } catch (e) {
        // A timed-out PUT may have committed. GET the same exact UID; NEVER
        // replay a write without confirming what happened on the server.
        const after = await cloudSyncApi(origin, doc.site_uid, token, "emails/" + doc.uid);
        accepted = cloudSyncValidateDetail(after, doc.site_uid, doc.uid);
        if (await cloudSyncHash(accepted) !== localHash) {
          await this.cloudSyncConflictCopy(accepted);
          report.conflicts++;
          return;
        }
      }
      if (accepted.revision <= doc.revision ||
        accepted.editable !== true || await cloudSyncHash(accepted) !== localHash) {
        throw Error("Cloud Sync write receipt did not confirm a new matching draft revision.");
      }
      const acceptedHash = await cloudSyncHash(accepted);
      this.settings.cloudSyncBaselines[key] = acceptedHash;
      if (!isActive) {
        // No subsequent network call: only update the local revision and hash.
        const newRaw = await this.app.vault.read(file);
        if (newRaw === original) {
          const metadata = cloudSyncUpsertYaml(original, {
            hakisend_remote_email_revision: accepted.revision,
            hakisend_sync_managed: true,
            hakisend_sync_base_hash: acceptedHash
          });
          const updatedCallout = cloudSyncRefreshCallout(metadata, accepted);
          await this.app.vault.process(file, (current) => {
            if (current !== original) throw Error("Email changed after server save; local copy preserved.");
            return updatedCallout;
          });
        } else report.deferred++;
      }
      report.uploaded++;
      return;
    }
    // Both sides changed since the last acknowledged content, or a promoted
    // draft has local edits. Preserve each copy and ask the operator to merge.
    await this.cloudSyncConflictCopy(doc);
    report.conflicts++;
  }
  async cloudSyncEmails(selectedSite = "all", onProgress = () => {}, automatic = false) {
    if (this.cloudSyncBusy) throw Error("Cloud Sync is already running.");
    if (!this.hasSecureConnection()) throw Error("Connect HakiSend Email access first.");
    if (selectedSite !== "all" && !this.settings.sites.some((s) => s.uid === selectedSite))
      throw Error("Selected Site is not authorized.");
    this.cloudSyncBusy = true;
    const report = { imported: 0, uploaded: 0, downloaded: 0, unchanged: 0, conflicts: 0, deferred: 0, errors: [] };
    try {
      const token = await this.getAccessToken();
      const origin = normalizeBaseUrl(this.settings.apiBaseUrl);
      const sites = selectedSite === "all" ? this.settings.sites : this.settings.sites.filter((s) => s.uid === selectedSite);
      const index = await this.cloudSyncFindLocalIndex();
      for (const site of sites) {
        let cursor = 0;
        let count = 0;
        for (let pageNumber = 0; pageNumber < 25; pageNumber++) {
          onProgress("Đang đồng bộ " + site.name + " · " + count + " email đã đối chiếu...");
          const page = cloudSyncValidatePage(await cloudSyncApi(
            origin, site.uid, token, "emails?after_id=" + cursor + "&limit=40"), site.uid);
          for (const entry of page.items) {
            try {
              const detail = cloudSyncValidateDetail(await cloudSyncApi(
                origin, site.uid, token, "emails/" + entry.uid), site.uid, entry.uid);
              await this.cloudSyncApply(detail, index, report, automatic);
            } catch (e) {
              report.errors.push(site.name + " / " + entry.subject + ": " + String(e).slice(0, 150));
            }
          }
          count += page.items.length;
          if (page.next_after_id === null) break;
          if (page.next_after_id <= cursor) throw Error("Cloud Sync pagination did not advance.");
          cursor = page.next_after_id;
          if (pageNumber === 24) throw Error("Cloud Sync Site has over 1000 drafts; use a bounded incremental sync.");
        }
      }
      return report;
    } finally {
      try {
        await this.saveSettings();
      } finally {
        this.cloudSyncBusy = false;
      }
    }
  }
  /** Scope the simplified view to standalone HakiSend Email notes only. */
  r3UpdateEmailPropertyVisibility() {
    const hideTechnical = this.settings.r3ShowEmailTechnicalProperties !== true;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      const file = view?.file;
      const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : null;
      const isStandaloneEmail = !!file?.path?.startsWith(ROOT2) &&
        fm?.hakisend_type === "email_campaign" && fm?.hakisend_email_kind === "standalone";
      view?.containerEl?.classList?.toggle("hakisend-email-simple", hideTechnical && isStandaloneEmail);
    }
  }
  /** Refresh only the active, already-approved email using the server's exact GET receipt. */
  async r3SyncActiveEmailStatus(showNotice = false) {
    if (this.r3StatusSyncBusy) return;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md" || !file.path.startsWith(ROOT2)) {
      if (showNotice) new import_obsidian.Notice("Hãy mở email trong thư mục HakiSend Emails.");
      return;
    }
    const cached = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    let fields;
    try {
      fields = localEmailFieldsFromRaw(await this.app.vault.read(file), cached);
    } catch (e) {
      if (showNotice) new import_obsidian.Notice("Không đọc được thông tin email này.");
      return;
    }
    const site = fields.site_uid, campaign2 = fields.hakisend_acelle_campaign_uid;
    if (typeof site !== "string" || typeof campaign2 !== "string" || !this.settings.sites.some((s) => s.uid === site)) {
      if (showNotice) new import_obsidian.Notice("Email này chưa liên kết với chiến dịch HakiSend đã chuẩn bị.");
      return;
    }
    const intent = this.r3PendingDelivery(site, campaign2);
    if (!intent) {
      if (showNotice) new import_obsidian.Notice("Email chưa có yêu cầu gửi hoặc đặt lịch trên máy này.");
      return;
    }
    if (!this.hasSecureConnection()) {
      if (showNotice) new import_obsidian.Notice("Cần kết nối tài khoản HakiSend để kiểm tra trạng thái.");
      return;
    }
    this.r3StatusSyncBusy = true;
    let rec;
    try {
      const token = await this.getAccessToken();
      rec = await readR3Receipt(
        (req) => (0, import_obsidian.requestUrl)(req),
        normalizeBaseUrl(this.settings.apiBaseUrl),
        intent,
        token
      );
    } catch (e) {
      // A request was persisted before its POST. A failed receipt GET says
      // nothing about transport success, so this path must never POST again.
      await this.r3ApplyDeliveryState(intent, null, file.path).catch(() => {});
      if (showNotice) new import_obsidian.Notice("Chưa xác định kết quả từ HakiSend. Không gửi lại email; hãy đối chiếu trên HakiSend.");
    }
    if (!rec) {
      this.r3StatusSyncBusy = false;
      return;
    }
    try {
      await this.r3ApplyDeliveryState(intent, rec, file.path);
      if (showNotice) new import_obsidian.Notice(r3DeliveryDisplay(rec, intent).label);
    } catch (e) {
      if (showNotice) new import_obsidian.Notice("Đã đọc kết quả HakiSend, nhưng không cập nhật được ghi chú. Hãy kiểm tra nội dung Properties.");
    } finally {
      this.r3StatusSyncBusy = false;
    }
  }
  /** Never alter email body or switch Campaign identities during a sync. */
  async r3ApplyDeliveryState(intent, verified, targetPath = "") {
    if (!intent || !UUID11.test(intent.siteUid) || !UID.test(intent.campaignUid) || !UUID11.test(intent.requestUid) || intent.action !== "send_now" && intent.action !== "schedule")
      throw Error("Invalid saved delivery identity.");
    if (!this.settings.sites.some((site) => site.uid === intent.siteUid))
      throw Error("Delivery Site is not authorized.");
    const stored = this.r3PendingDelivery(intent.siteUid, intent.campaignUid);
    if (!stored || stored.requestUid !== intent.requestUid || stored.action !== intent.action)
      throw Error("Saved delivery identity changed. Local status unchanged.");
    const display = r3DeliveryDisplay(verified, intent);
    const candidates = targetPath
      ? [this.app.vault.getAbstractFileByPath(targetPath)]
      : this.app.vault.getMarkdownFiles().filter((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.site_uid === intent.siteUid && fm?.hakisend_acelle_campaign_uid === intent.campaignUid;
        });
    let updated = 0;
    for (const file of candidates) {
      if (!(file instanceof import_obsidian.TFile) || !file.path.startsWith(ROOT2) || file.extension !== "md") continue;
      let changed = false;
      let propertiesChanged = false;
      const scheduledUtc = intent.action === "schedule" && verified?.runAtUtc ? verified.runAtUtc : "";
      const expectedProperties = verified ? {
        hakisend_delivery_status: display.state,
        hakisend_status: "email_" + display.state,
        hakisend_delivery_action: intent.action,
        hakisend_delivery_journal_status: verified.journalStatus,
        hakisend_delivery_native_status: verified.nativeStatus || "unknown",
        hakisend_delivery_scheduled_at_utc: scheduledUtc,
        email_send_policy: intent.action === "schedule" ? "scheduled" : "now",
        email_scheduled_at_utc: scheduledUtc,
        email_dispatch_ready: true,
        hakisend_local_only: false
      } : null;
      await this.app.vault.process(file, (latest) => {
        const cached = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
        const fields = localEmailFieldsFromRaw(latest, cached);
        if (fields.hakisend_type !== "email_campaign" || fields.hakisend_email_kind !== "standalone" || fields.site_uid !== intent.siteUid || fields.hakisend_acelle_campaign_uid !== intent.campaignUid)
          throw Error("Source Campaign changed. Local status unchanged.");
        propertiesChanged = !!expectedProperties && Object.entries(expectedProperties).some(([key, value]) => fields[key] !== value);
        // A later GET failure must not downgrade a previously verified status.
        if (!verified && (fields.hakisend_delivery_verified_at || /^> \[!(?:info|success|warning)\] HakiSend · Trạng thái gửi:/m.test(latest))) return latest;
        const decorated = r3DecorateDeliveryState(latest, display, {
          siteName: this.settings.sites.find((site) => site.uid === intent.siteUid)?.name || "",
          listName: typeof fields.email_list_name === "string" ? fields.email_list_name : "",
          recipientCount: verified?.recipientCount
        });
        const next = simplifyStandaloneEmailNote(decorated, fields);
        changed = next !== latest;
        return next;
      });
      // Existing 0.1.13 notes may already show the correct banner while their
      // initial local-plan Properties still say "now" and "local_only".
      if ((changed || propertiesChanged) && expectedProperties) {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          if (fm.site_uid !== intent.siteUid || fm.hakisend_acelle_campaign_uid !== intent.campaignUid)
            throw Error("Source Campaign changed during receipt update.");
          for (const [key, value] of Object.entries(expectedProperties)) fm[key] = value;
          fm.hakisend_delivery_verified_at = new Date().toISOString();
        });
      }
      updated++;
    }
    return updated;
  }
  r3PendingDelivery(site, campaign2) {
    var _a, _b;
    const s = this.settings;
    return (_b = (_a = s.r3PendingIntents) == null ? void 0 : _a[site + ":" + campaign2]) != null ? _b : null;
  }
  async r3PersistIntent(intent) {
    var _a;
    const s = this.settings;
    const key = intent.siteUid + ":" + intent.campaignUid;
    if ((_a = s.r3PendingIntents) == null ? void 0 : _a[key]) throw Error("Campaign already has delivery intent. GET receipt only.");
    const previous = s.r3PendingIntents;
    s.r3PendingIntents = { ...previous != null ? previous : {}, [key]: intent };
    try {
      await this.saveSettings();
    } catch (e) {
      s.r3PendingIntents = previous;
      throw Error("Could not durably persist request. Nothing submitted.");
    }
  }
  async getAccessToken() {
    const secure = this.app.secretStorage.getSecret(
      ACCESS_TOKEN_SECRET
    );
    if (typeof secure === "string" && secure.trim() !== "") {
      return secure.trim();
    }
    // Legacy data.json tokens are deliberately never used for network requests.
    // Reconnecting through PKCE clears the old plaintext setting on success.
    return "";
  }
  hasSecureConnection() {
    const token = this.app.secretStorage.getSecret(
      ACCESS_TOKEN_SECRET
    );
    return !!(token == null ? void 0 : token.trim());
  }
  hasLegacyToken() {
    var _a;
    return !!((_a = this.settings.bearerToken) == null ? void 0 : _a.trim());
  }
  async startBrowserConnect(requestEmailAccess = false, requestDeliveryAccess = false) {
    try {
      const apiBaseUrl = normalizeBaseUrl(
        this.settings.apiBaseUrl
      );
      const state = randomBase64Url(32);
      const verifier = randomBase64Url(64);
      const challenge = await sha256Base64Url(
        verifier
      );
      const pending = {
        state,
        verifier,
        apiBaseUrl,
        createdAt: Date.now(),
        emailAccessRequested: requestEmailAccess === true,
        deliveryAccessRequested: requestDeliveryAccess === true
      };
      this.app.secretStorage.setSecret(
        PENDING_CONNECTION_SECRET,
        JSON.stringify(pending)
      );
      const url2 = new URL(
        apiBaseUrl + "/rui/sites/integrations/obsidian/connect"
      );
      url2.searchParams.set(
        "state",
        state
      );
      url2.searchParams.set(
        "code_challenge",
        challenge
      );
      url2.searchParams.set(
        "code_challenge_method",
        "S256"
      );
      if (requestEmailAccess === true) {
        url2.searchParams.set("email_access_requested", requestDeliveryAccess ? "read_compose_delivery" : "read_compose");
      }
      const opened = window.open(
        url2.toString(),
        "_blank"
      );
      if (!opened) {
        new import_obsidian.Notice(
          "Could not open the browser. Check popup/external-link permissions."
        );
        return;
      }
      new import_obsidian.Notice(
        "Continue authorization in your browser."
      );
    } catch (error) {
      this.clearPendingConnection();
      new import_obsidian.Notice(
        "Could not start HakiSend connection: " + this.safeErrorMessage(error)
      );
    }
  }
  async handleConnectCallback(params) {
    var _a, _b, _c, _d, _e, _f, _g;
    const rawPending = this.app.secretStorage.getSecret(
      PENDING_CONNECTION_SECRET
    );
    if (!rawPending) {
      new import_obsidian.Notice(
        "No pending HakiSend connection was found."
      );
      return;
    }
    let pending;
    try {
      pending = JSON.parse(rawPending);
    } catch (e) {
      this.clearPendingConnection();
      new import_obsidian.Notice(
        "The pending HakiSend connection is invalid."
      );
      return;
    }
    if (!pending.state || !pending.verifier || !pending.apiBaseUrl || !pending.createdAt) {
      this.clearPendingConnection();
      new import_obsidian.Notice(
        "The pending HakiSend connection is incomplete."
      );
      return;
    }
    if (Date.now() - pending.createdAt > PENDING_MAX_AGE_MS) {
      this.clearPendingConnection();
      new import_obsidian.Notice(
        "The HakiSend connection request expired. Please connect again."
      );
      return;
    }
    const returnedState = (_a = params.state) != null ? _a : "";
    if (!returnedState || returnedState !== pending.state) {
      new import_obsidian.Notice(
        "HakiSend connection state did not match. No credential was accepted."
      );
      return;
    }
    if (params.error) {
      this.clearPendingConnection();
      new import_obsidian.Notice(
        params.error === "access_denied" ? "HakiSend connection was cancelled." : "HakiSend connection failed."
      );
      return;
    }
    const code = (_b = params.code) != null ? _b : "";
    if (!code) {
      this.clearPendingConnection();
      new import_obsidian.Notice(
        "HakiSend did not return an authorization code."
      );
      return;
    }
    try {
      const response = await (0, import_obsidian.requestUrl)({
        url: pending.apiBaseUrl + "/api/v1/hakisend/connect/exchange",
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          code,
          state: pending.state,
          code_verifier: pending.verifier
        }),
        throw: false
      });
      const payload = response.json;
      if (response.status < 200 || response.status >= 300 || !(payload == null ? void 0 : payload.success)) {
        throw new Error(
          this.apiErrorMessage(
            response.status,
            response.headers,
            payload == null ? void 0 : payload.error
          )
        );
      }
      const token = (_e = (_d = (_c = payload.data) == null ? void 0 : _c.access_token) == null ? void 0 : _d.trim()) != null ? _e : "";
      if (!token) {
        throw new Error(
          "HakiSend exchange response did not include an access token."
        );
      }
      const emailReconnect = pending.emailAccessRequested === true;
      const evidence = verifyConnectScopes(
        (_f = payload.data) == null ? void 0 : _f.scopes,
        emailReconnect,
        pending.deliveryAccessRequested === true
      );
      if (!evidence.ok) {
        this.clearPendingConnection();
        throw Error(evidence.reason);
      }
      if (emailReconnect) {
        const probe = await (0, import_obsidian.requestUrl)({
          url: pending.apiBaseUrl + "/api/v1/hakisend/sites",
          method: "GET",
          headers: {
            "Accept": "application/json",
            "Authorization": `Bearer ${token}`
          },
          throw: false
        });
        if (!verifyEmailReconnectSitesProbe(probe.status, probe.json)) {
          this.clearPendingConnection();
          throw Error("New Email-capable token could not read HakiSend Sites. Previous connection preserved.");
        }
      }
      const previousToken = this.app.secretStorage.getSecret(
        ACCESS_TOKEN_SECRET
      );
      const previousSettings = JSON.parse(
        JSON.stringify(this.settings)
      );
      try {
        this.app.secretStorage.setSecret(ACCESS_TOKEN_SECRET, token);
        this.settings.bearerToken = "";
        this.settings.apiBaseUrl = pending.apiBaseUrl;
        await this.saveSettings();
        await this.discoverSites();
      } catch (e) {
        this.app.secretStorage.setSecret(
          ACCESS_TOKEN_SECRET,
          previousToken != null ? previousToken : ""
        );
        this.settings = previousSettings;
        try {
          await this.saveSettings();
        } catch (e2) {
        }
        this.clearPendingConnection();
        throw Error("New HakiSend connection could not be activated; previous token restored.");
      }
      this.clearPendingConnection();
      new import_obsidian.Notice(emailReconnect ? "HakiSend Email Draft Access connected. Sending is NOT enabled." : "HakiSend connected successfully.");
      (_g = this.settingTab) == null ? void 0 : _g.display();
    } catch (error) {
      new import_obsidian.Notice(
        "HakiSend connection failed: " + this.safeErrorMessage(error)
      );
    }
  }
  clearPendingConnection() {
    this.app.secretStorage.setSecret(
      PENDING_CONNECTION_SECRET,
      ""
    );
  }
  async clearLocalConnectionState() {
    var _a;
    this.app.secretStorage.setSecret(
      ACCESS_TOKEN_SECRET,
      ""
    );
    this.clearPendingConnection();
    this.settings.bearerToken = "";
    this.settings.sites = [];
    this.settings.defaultSiteUid = "";
    await this.saveSettings();
    (_a = this.settingTab) == null ? void 0 : _a.display();
  }
  async disconnect() {
    var _a;
    const token = await this.getAccessToken();
    if (!token) {
      await this.clearLocalConnectionState();
      new import_obsidian.Notice(
        "HakiSend disconnected from Obsidian."
      );
      return;
    }
    try {
      const response = await (0, import_obsidian.requestUrl)({
        url: normalizeBaseUrl(
          this.settings.apiBaseUrl
        ) + "/api/v1/hakisend/connect/revoke",
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Authorization": `Bearer ${token}`
        },
        throw: false
      });
      const payload = response.json;
      const alreadyInvalid = response.status === 401;
      if (!alreadyInvalid && (response.status < 200 || response.status >= 300 || !(payload == null ? void 0 : payload.success))) {
        throw new Error(
          this.apiErrorMessage(
            response.status,
            response.headers,
            (_a = payload == null ? void 0 : payload.error) != null ? _a : {
              message: payload == null ? void 0 : payload.message
            }
          )
        );
      }
      await this.clearLocalConnectionState();
      new import_obsidian.Notice(
        alreadyInvalid ? "HakiSend disconnected. The saved credential was already invalid or revoked." : "HakiSend disconnected and server credential revoked."
      );
    } catch (error) {
      new import_obsidian.Notice(
        "HakiSend Disconnect failed; local credential was kept so you can retry: " + this.safeErrorMessage(
          error
        )
      );
    }
  }
  async discoverSites() {
    var _a;
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error(
        "HakiSend is not connected."
      );
    }
    const response = await (0, import_obsidian.requestUrl)({
      url: normalizeBaseUrl(
        this.settings.apiBaseUrl
      ) + "/api/v1/hakisend/sites",
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      },
      throw: false
    });
    const payload = response.json;
    if (response.status < 200 || response.status >= 300 || !(payload == null ? void 0 : payload.success)) {
      throw new Error(
        this.apiErrorMessage(
          response.status,
          response.headers,
          payload == null ? void 0 : payload.error
        )
      );
    }
    let sites = [];
    if (Array.isArray(
      payload.data
    )) {
      sites = payload.data;
    } else if (payload.data && Array.isArray(
      payload.data.sites
    )) {
      sites = payload.data.sites;
    }
    this.settings.sites = sites.filter(
      (site) => !!site && typeof site.uid === "string" && typeof site.name === "string"
    );
    const currentStillExists = this.settings.sites.some(
      (site) => site.uid === this.settings.defaultSiteUid
    );
    if (!currentStillExists) {
      this.settings.defaultSiteUid = this.settings.sites.length === 1 ? this.settings.sites[0].uid : "";
    }
    await this.saveSettings();
    (_a = this.settingTab) == null ? void 0 : _a.display();
    return this.settings.sites;
  }
  async loadPublishingPostCalendar(siteUid, from, to) {
    if (!validUuid(siteUid) || !this.settings.sites.some((site) => site.uid === siteUid))
      throw Error("Site chưa được kết nối với Vault.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
      throw Error("Khoảng ngày Calendar không hợp lệ.");
    const token = await this.getAccessToken();
    if (!token) throw Error("Chưa kết nối HakiSend.");
    const url = normalizeBaseUrl(this.settings.apiBaseUrl) +
      "/api/v1/hakisend/sites/" + encodeURIComponent(siteUid) +
      "/posts/calendar?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
    const response = await (0, import_obsidian.requestUrl)({
      url, method: "GET", headers: {
        "Accept": "application/json", "Authorization": `Bearer ${token}`
      }, throw: false
    });
    if (response.status !== 200)
      throw Error(this.apiErrorMessage(response.status, response.headers, response.json?.error));
    return validatePostCalendar(response.json, siteUid, from, to);
  }
  async loadNativeContentCalendar(siteUid, month) {
    if (!validUuid(siteUid) || !this.settings.sites.some((site) => site.uid === siteUid))
      throw Error("Site is not authorized in this vault.");
    if (!(month instanceof Date) || !Number.isFinite(month.getTime()))
      throw Error("Invalid Calendar month.");
    const token = await this.getAccessToken();
    if (!token || !this.hasSecureConnection()) throw Error("Secure HakiSend connection required.");
    const origin = new URL(normalizeBaseUrl(this.settings.apiBaseUrl));
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.search ||
      origin.hash || origin.pathname !== "/") throw Error("Calendar requires a plain HTTPS origin.");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const focus = hksCalendarDay(month);
    const url = origin.origin + "/api/v1/hakisend/sites/" + encodeURIComponent(siteUid) +
      "/publisher/calendar?view=month&type=all&focus=" + encodeURIComponent(focus) +
      "&tz=" + encodeURIComponent(timezone);
    const response = await (0, import_obsidian.requestUrl)({
      url, method: "GET", headers: { Accept: "application/json", Authorization: "Bearer " + token },
      throw: false
    });
    if (response.status === 200) return acceptNativeContentCalendar(response.json, siteUid);
    // Keep Website dates usable on an older backend, but never fabricate Email
    // schedules from local drafts or unverified campaign status.
    const range = hksCalendarRange(month);
    const website = await this.loadPublishingPostCalendar(siteUid, range.from, range.to);
    return {
      events: website.events.map((event) => ({
        siteUid, uid: event.uid, kind: "post", title: event.title,
        date: hksCalendarDay(event.when),
        time: event.when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        state: event.state === "planned" ? "post_planned" : "post_authoring_published",
        serverConfirmed: true
      })),
      truncated: website.truncated,
      incomplete: "Email calendar unavailable on the current HakiSend API (HTTP " + response.status + "). Website dates only."
    };
  }
  async facebookApi(siteUid, path, method = "GET", payload = null) {
    // Deliberately keep the method signature for historical plugin state, but
    // make every invocation inert until Facebook is explicitly re-released.
    throw Error("Facebook Publisher đang tạm ngừng ở bản Website + Email.");
  }
  async loadUnifiedPublishingCalendar(siteUid,from,to) {
    return this.loadPublishingPostCalendar(siteUid,from,to);
  }
  async openFacebookPublishing() {
    new import_obsidian.Notice("Facebook Publisher sẽ phát triển ở bản sau; Calendar hiện dành cho Website và Email.");
  }
  findCalendarOriginalPost(event) {
    if (!event || !validUuid(event.siteUid) || !validUuid(event.uid) ||
      !validUuid(event.externalId)) return null;
    const matched = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.extension !== "md" || file.path.startsWith("HakiSend Emails/") ||
        file.path.startsWith("HakiSend Imports/")) continue;
      const fields = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      if (fields.external_id !== event.externalId || !publishedPostStatus(fields.status) ||
        fields.hakisend_import_snapshot === true || fields.hakisend_read_only === true) continue;
      try {
        if (this.resolveSiteForFile(file, fields) === event.siteUid) matched.push(file);
      } catch (_error) { /* Unknown Site is not evidence of matching ownership. */ }
    }
    if (matched.length > 1)
      throw Error("Có nhiều Post cùng external_id trong Vault. Cần xác định bản gốc trước khi sửa lịch.");
    return matched[0] || null;
  }
  async checkCalendarPublicPost(event) {
    if (!event || !validUuid(event.externalId) || !validUuid(event.uid) ||
      !validUuid(event.siteUid)) throw Error("Không có liên kết Post gốc hợp lệ.");
    const post = await this.resolvePublishedPostUrl(event.siteUid, event.externalId);
    if (post.uid !== event.uid) throw Error("UID Post đã thay đổi.");
    if (!post.publicUrl) return "unverified";
    const response = await (0, import_obsidian.requestUrl)({
      url: post.publicUrl, method: "GET", throw: false,
      headers: { "Accept": "text/html", "Cookie": "", "Cache-Control": "no-cache" }
    });
    return response.status === 200 &&
      publicPostPageShowsTitle(String(response.text || ""), post.title)
      ? "published" : "unverified";
  }
  async cancelCalendarPostSchedule(event, file) {
    let postSaved = false;
    let publicationUpdated = false;
    try {
      if (!event || event.state !== "planned" || event.when.getTime() <= Date.now() ||
        !validUuid(event.externalId) || !validUuid(event.uid))
        throw Error("Chỉ có thể hủy lịch đang chờ đăng của Post gốc.");
      const matched = this.findCalendarOriginalPost(event);
      if (!matched || matched.path !== file.path || this.app.workspace.getActiveFile()?.path !== file.path)
        throw Error("Hãy mở đúng Post gốc để hủy lịch.");
      const fields = localEmailFieldsFromRaw(await this.app.vault.read(file),
        this.app.metadataCache.getFileCache(file)?.frontmatter || {});
      if (fields.external_id !== event.externalId || this.resolveSiteForFile(file, fields) !== event.siteUid)
        throw Error("Thông tin Post trong Vault không khớp với lịch.");
      const localTime = dateFromScheduleValue(fields.publish_at);
      if (!localTime || Math.abs(localTime.getTime() - event.when.getTime()) > 6e4)
        throw Error("Ngày đăng của Post đã thay đổi. Hãy tải lại Calendar.");
      const range = hksCalendarRange(event.when);
      const snapshot = await this.loadPublishingPostCalendar(event.siteUid, range.from, range.to);
      const current = snapshot.events.find((item) => item.uid === event.uid);
      if (!current || current.state !== "planned" ||
        current.when.getTime() !== event.when.getTime() || current.externalId !== event.externalId)
        throw Error("Lịch trên HakiSend đã thay đổi. Hãy tải lại trước khi hủy.");
      const saved = await this.saveCurrentNoteCore(false,
        { status: "draft", publish_at: null, unpublish_at: null });
      postSaved = true;
      if (saved.siteUid !== event.siteUid || saved.post?.uid !== event.uid)
        throw Error("Post vừa lưu không khớp UID đã xác minh. Cần kiểm tra lại trên HakiSend.");
      await this.publishSavedState(saved);
      publicationUpdated = true;
      await this.app.fileManager.processFrontMatter(file, (front) => {
        front.status = "draft";
        delete front.publish_at;
        delete front.unpublish_at;
      });
      new import_obsidian.Notice("Đã hủy lịch, chuyển Post về nháp và cập nhật xuất bản trên HakiSend.");
      return true;
    } catch (error) {
      const prefix = publicationUpdated ? "Lịch đã hủy trên HakiSend nhưng cập nhật Properties thất bại: " :
        postSaved ? "Post đã chuyển về nháp nhưng đồng bộ bản xuất bản thất bại; cần kiểm tra lại trên HakiSend: " :
          "Chưa hủy lịch: ";
      new import_obsidian.Notice(prefix + this.safeErrorMessage(error));
      return false;
    }
  }
  async resolvePublishedPostUrl(siteUid, externalId) {
    if (!validUuid(siteUid) || !validUuid(externalId))
      throw Error("Site UID hoặc external_id của Post không hợp lệ.");
    const site = this.settings.sites.find((row) => row.uid === siteUid);
    if (!site) throw Error("Site không còn được cấp quyền.");
    const token = await this.getAccessToken();
    if (!token) throw Error("Hãy kết nối HakiSend trước khi đọc Post.");
    const response = await (0, import_obsidian.requestUrl)({
      url: normalizeBaseUrl(this.settings.apiBaseUrl) +
        "/api/v1/hakisend/sites/" + encodeURIComponent(siteUid) +
        "/posts/by-external/" + encodeURIComponent(externalId),
      method: "GET",
      headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` },
      throw: false
    });
    const payload = response.json;
    if (response.status < 200 || response.status >= 300 || !payload?.success || !payload.data)
      throw Error(this.apiErrorMessage(response.status, response.headers, payload?.error));
    return verifiedServerPostUrl(payload.data, site, this.settings, siteUid, externalId);
  }
  resolveSiteForFile(file, frontmatter = {}) {
    const explicit = [frontmatter.site_uid, frontmatter.site].find((value) => typeof value === "string" && !!value.trim());
    if (typeof explicit === "string") {
      const key = explicit.trim().toLowerCase();
      const site = this.settings.sites.find(
        (candidate) => candidate.uid.toLowerCase() === key || (candidate.slug || "").toLowerCase() === key || candidate.name.toLowerCase() === key
      );
      if (!site) throw new Error(`Site "${explicit}" in Properties is not accessible. Refresh HakiSend Sites.`);
      return site.uid;
    }
    const routes = [...this.settings.folderSiteMappings].filter((route) => pathIsWithinFolder(file.path, route.folderPath)).sort((a, b) => b.folderPath.length - a.folderPath.length);
    if (routes.length) {
      const uid3 = routes[0].siteUid;
      if (!this.settings.sites.some((site) => site.uid === uid3))
        throw new Error(`Folder route "${routes[0].folderPath}" refers to an unavailable HakiSend Site.`);
      return uid3;
    }
    const fallback = this.settings.defaultSiteUid.trim();
    if (!fallback) throw new Error("Choose a Default Site or configure Folder \u2192 Site routes.");
    if (this.settings.sites.length && !this.settings.sites.some((site) => site.uid === fallback))
      throw new Error("Default Site unavailable. Refresh HakiSend Sites.");
    return fallback;
  }
  resolveSiteForFolder(folder) {
    return this.resolveSiteForFile({ path: normalizeFolderPath(folder) + "/_new.md" });
  }
  findCategoryRoute(filePath, siteUid) {
    const routes = [...this.settings.folderCategoryMappings].filter((route) => pathIsWithinFolder(filePath, route.folderPath)).sort((a, b) => b.folderPath.length - a.folderPath.length);
    if (!routes.length) return null;
    if (routes[0].siteUid !== siteUid) {
      throw new Error(`Category folder "${routes[0].folderPath}" belongs to a different HakiSend Site. Review site_uid or the folder route.`);
    }
    return routes[0];
  }
  openAddCategoryRouteModal() {
    const sites = this.settings.sites;
    if (!sites.length) {
      new import_obsidian.Notice("Connect HakiSend and refresh Sites before mapping Categories.");
      return;
    }
    const modal = new import_obsidian.Modal(this.app);
    modal.titleEl.setText("Map Obsidian folder to HakiSend Category");
    modal.contentEl.createEl("p", {
      text: "Each Site has its own Categories. Child folders inherit the closest Category route."
    });
    let folderPath = "";
    let siteUid = sites[0].uid;
    let categoryUid = "";
    let loadedCategories = [];
    let loadSequence = 0;
    let siteDropdown = null;
    const folderSetting = new import_obsidian.Setting(modal.contentEl).setName("Obsidian folder").setDesc("No folder selected. Search the folders in this vault.");
    folderSetting.addButton((button) => button.setButtonText("Choose folder\u2026").onClick(() => {
      new HakiSendFolderPicker(this.app, (folder) => {
        folderPath = folder.path;
        folderSetting.setDesc(folderPath);
        try {
          const routedSite = this.resolveSiteForFolder(folder.path);
          if (routedSite !== siteUid) {
            siteUid = routedSite;
            siteDropdown == null ? void 0 : siteDropdown.setValue(siteUid);
            void reloadCategories();
          }
        } catch (error) {
          folderSetting.setDesc(folderPath + " \xB7 " + this.safeErrorMessage(error));
        }
      }).open();
    }));
    const categorySetting = new import_obsidian.Setting(modal.contentEl).setName("Category").setDesc("Loading Categories from selected HakiSend Site...");
    const reloadCategories = async () => {
      const request2 = ++loadSequence;
      loadedCategories = [];
      categoryUid = "";
      categorySetting.controlEl.empty();
      categorySetting.setDesc("Loading authorized Categories...");
      try {
        const token = await this.getAccessToken();
        if (!token) throw new Error("HakiSend is not connected.");
        const loaded = await this.categoriesForSite(siteUid, token);
        if (request2 !== loadSequence) return;
        loadedCategories = loaded;
        categorySetting.setDesc(loaded.length ? "Select one Category from this Site." : "No Categories exist on this Site.");
        categorySetting.addDropdown((dropdown) => {
          dropdown.addOption("", "Choose a Category");
          for (const category of loaded) {
            dropdown.addOption(category.uid, category.title + " (" + category.slug + ")");
          }
          dropdown.setValue("");
          dropdown.onChange((value) => {
            categoryUid = value;
          });
        });
      } catch (error) {
        if (request2 !== loadSequence) return;
        categorySetting.setDesc("Cannot load Categories: " + this.safeErrorMessage(error));
      }
    };
    new import_obsidian.Setting(modal.contentEl).setName("Site").setDesc("Selected automatically from the folder's Site route.").addDropdown((dropdown) => {
      siteDropdown = dropdown;
      for (const site of sites) dropdown.addOption(site.uid, site.name);
      dropdown.setValue(siteUid);
      dropdown.onChange((value) => {
        siteUid = value;
        void reloadCategories();
      });
    });
    void reloadCategories();
    new import_obsidian.Setting(modal.contentEl).addButton((button) => button.setButtonText("Cancel").onClick(() => modal.close())).addButton((button) => button.setButtonText("Save mapping").setCta().onClick(async () => {
      var _a;
      const folder = normalizeFolderPath(folderPath);
      const selected = loadedCategories.find((item) => item.uid === categoryUid);
      if (!folder || !selected) {
        new import_obsidian.Notice("Choose an existing folder and a HakiSend Category.");
        return;
      }
      const target = this.app.vault.getAbstractFileByPath(folder);
      if (!target || !(target instanceof import_obsidian.TFolder)) {
        new import_obsidian.Notice("Create this folder in Obsidian before mapping it.");
        return;
      }
      try {
        const resolvedSite = this.resolveSiteForFolder(folder);
        if (resolvedSite !== siteUid) {
          throw new Error("This folder routes to a different Site. Set its parent Site route first.");
        }
        this.settings.folderCategoryMappings = this.settings.folderCategoryMappings.filter((item) => item.folderPath !== folder);
        this.settings.folderCategoryMappings.push({
          folderPath: folder,
          siteUid,
          categoryUid: selected.uid,
          categoryTitle: selected.title
        });
        await this.saveSettings();
        modal.close();
        (_a = this.settingTab) == null ? void 0 : _a.display();
        new import_obsidian.Notice("Category folder mapping saved.");
      } catch (error) {
        new import_obsidian.Notice("Category mapping failed: " + this.safeErrorMessage(error));
      }
    }));
    modal.open();
  }
  openSelectSiteForNote() {
    var _a, _b;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension.toLowerCase() !== "md") {
      new import_obsidian.Notice("Open a Markdown note first.");
      return;
    }
    const sites = this.settings.sites;
    if (!sites.length) {
      new import_obsidian.Notice("Connect HakiSend and load available Sites first.");
      return;
    }
    const initial = (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {};
    const pinned = typeof initial.site_uid === "string" ? initial.site_uid : "";
    const modal = new import_obsidian.Modal(this.app);
    modal.titleEl.setText("Choose HakiSend Site");
    modal.contentEl.createEl("p", {
      text: "Pin this note to one Site, or use its folder route. Changing Site after publishing may create a Post on the new Site."
    });
    let chosen = pinned;
    new import_obsidian.Setting(modal.contentEl).setName("Publishing Site").addDropdown((dropdown) => {
      dropdown.addOption("", "Use folder mapping / Default Site");
      for (const site of sites) dropdown.addOption(site.uid, site.name);
      dropdown.setValue(chosen);
      dropdown.onChange((value) => {
        chosen = value;
      });
    });
    new import_obsidian.Setting(modal.contentEl).addButton((button) => button.setButtonText("Apply to Properties").setCta().onClick(async () => {
      try {
        await this.app.fileManager.processFrontMatter(file, (data2) => {
          delete data2.site;
          if (chosen) data2.site_uid = chosen;
          else delete data2.site_uid;
        });
        modal.close();
        new import_obsidian.Notice("Site saved locally. Review Category before publishing.");
      } catch (error) {
        new import_obsidian.Notice("Cannot set Site: " + this.safeErrorMessage(error));
      }
    }));
    modal.open();
  }
  async openPostProperties() {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension.toLowerCase() !== "md") {
        throw new Error(
          "Open a Markdown note before editing HakiSend Properties."
        );
      }
      const token = await this.getAccessToken();
      if (!token) {
        throw new Error(
          "HakiSend is not connected."
        );
      }
      const siteUid = this.resolveSiteForFile(
        file,
        (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {}
      );
      const categories = await this.categoriesForSite(
        siteUid,
        token
      );
      if (!categories.length) {
        throw new Error(
          "This Site has no Categories."
        );
      }
      const cached = this.app.metadataCache.getFileCache(
        file
      );
      const frontmatter = (cached == null ? void 0 : cached.frontmatter) ? {
        ...cached.frontmatter
      } : {};
      const title = typeof frontmatter.title === "string" && frontmatter.title.trim() ? frontmatter.title.trim() : file.basename;
      const slug = typeof frontmatter.slug === "string" ? frontmatter.slug.trim() : "";
      const excerpt = typeof frontmatter.excerpt === "string" ? frontmatter.excerpt.trim() : "";
      const externalId = typeof frontmatter.external_id === "string" ? frontmatter.external_id.trim() : "";
      const status = typeof frontmatter.status === "string" ? frontmatter.status.trim() : "";
      const tags = normalizeTagValues(
        frontmatter.tags
      );
      const configuredCategory = typeof frontmatter.category === "string" ? frontmatter.category.trim() : "";
      const fallbackCategory = (_e = (_d = (_c = file.parent) == null ? void 0 : _c.name) == null ? void 0 : _d.trim()) != null ? _e : "";
      const requestedCategory = configuredCategory || fallbackCategory;
      const lowered = requestedCategory.toLowerCase();
      const slugged = simpleSlug(
        requestedCategory
      );
      const categoryRoute = this.findCategoryRoute(file.path, siteUid);
      const pinnedCategoryUid = typeof frontmatter.category_uid === "string" ? frontmatter.category_uid.trim() : "";
      const pinnedCategory = pinnedCategoryUid ? categories.find((item) => item.uid === pinnedCategoryUid) : null;
      if (pinnedCategoryUid && !pinnedCategory)
        throw new Error("This note's category_uid does not belong to its current Site. Choose a new Category for the Site.");
      const manualCategory = categories.find(
        (category) => category.uid === requestedCategory || category.slug.toLowerCase() === lowered || category.title.toLowerCase() === lowered || category.slug.toLowerCase() === slugged
      );
      if (configuredCategory && !manualCategory && !pinnedCategory)
        throw new Error("This note's Category does not belong to its current Site. Update its category in Properties.");
      const mappedCategory = categoryRoute ? categories.find((item) => item.uid === categoryRoute.categoryUid) : null;
      if (categoryRoute && !mappedCategory)
        throw new Error("Mapped Category no longer exists on this Site. Update the Category folder mapping.");
      const selectedCategory = (_g = (_f = pinnedCategory != null ? pinnedCategory : manualCategory) != null ? _f : mappedCategory) != null ? _g : categories[0];
      new HakiSendPostPropertiesModal(
        this.app,
        categories,
        {
          title,
          slug,
          categoryUid: selectedCategory.uid,
          tags,
          excerpt,
          externalId,
          status
        },
        async (values) => {
          await this.updatePostProperties(
            file,
            values
          );
        }
      ).open();
    } catch (error) {
      new import_obsidian.Notice(
        "HakiSend Properties failed: " + this.safeErrorMessage(
          error
        )
      );
    }
  }
  async updatePostProperties(file, values) {
    await this.app.fileManager.processFrontMatter(
      file,
      (data2) => {
        data2.title = values.title;
        data2.category = values.category.slug;
        data2.category_uid = values.category.uid;
        if (values.slug) {
          data2.slug = values.slug;
        } else {
          delete data2.slug;
        }
        if (values.tags.length) {
          data2.tags = values.tags;
        } else {
          delete data2.tags;
        }
        if (values.excerpt) {
          data2.excerpt = values.excerpt;
        } else {
          delete data2.excerpt;
        }
      }
    );
    new import_obsidian.Notice(
      "HakiSend Properties updated locally. Save, Schedule, or Publish when ready."
    );
  }
  /**
   * This folder's resolved Site and mapped Category control all default
   * values. A nested folder inherits the closest Category route; a folder
   * with no matching mapping requires an explicit Category selection.
   */
  async resolveNewPostDestination(folderPath) {
    var _a, _b;
    const folder = normalizeFolderPath(folderPath);
    const target = this.app.vault.getAbstractFileByPath(folder);
    if (!folder || !(target instanceof import_obsidian.TFolder)) {
      throw new Error("Choose an existing Obsidian folder.");
    }
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error("HakiSend is not connected.");
    }
    const siteUid = this.resolveSiteForFolder(folder);
    const site = this.settings.sites.find((item) => item.uid === siteUid);
    if (!site) {
      throw new Error("The folder is not linked to an accessible HakiSend Site.");
    }
    const categories = await this.categoriesForSite(siteUid, token);
    if (!categories.length) {
      throw new Error("This Site has no Categories. Create a Category in HakiSend first.");
    }
    const route = this.findCategoryRoute(folder + "/_new.md", siteUid);
    const mapped = route ? categories.find((item) => item.uid === route.categoryUid) : void 0;
    if (route && !mapped) {
      throw new Error(
        "The mapped Category no longer exists on this Site. Update its Category folder mapping."
      );
    }
    const folderName = target.name.trim();
    const normalizedName = folderName.toLowerCase();
    const folderSlug = simpleSlug(folderName);
    const matchedByName = categories.find(
      (item) => item.title.toLowerCase() === normalizedName || item.slug.toLowerCase() === normalizedName || item.slug.toLowerCase() === folderSlug
    );
    return {
      folderPath: folder,
      siteUid,
      siteName: site.name,
      categories,
      preferredCategoryUid: (_b = (_a = mapped != null ? mapped : matchedByName) == null ? void 0 : _a.uid) != null ? _b : ""
    };
  }
  async openNewPost() {
    var _a, _b;
    try {
      const token = await this.getAccessToken();
      if (!token) {
        throw new Error("HakiSend is not connected.");
      }
      const active = this.app.workspace.getActiveFile();
      const initialFolder = (_b = (_a = active == null ? void 0 : active.parent) == null ? void 0 : _a.path) != null ? _b : "";
      new HakiSendNewPostModal(
        this.app,
        initialFolder,
        async (folder) => this.resolveNewPostDestination(folder),
        async (values) => this.createNewPost(values)
      ).open();
    } catch (error) {
      new import_obsidian.Notice("HakiSend New Post failed: " + this.safeErrorMessage(error));
    }
  }
  uniqueNewPostPath(folderPath, title) {
    const folder = folderPath.replace(
      /^\/+|\/+$/g,
      ""
    );
    const prefix = folder ? folder + "/" : "";
    const basename = safeMarkdownBasename(
      title
    );
    let candidate = prefix + basename + ".md";
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(
      candidate
    )) {
      candidate = prefix + basename + " " + suffix + ".md";
      suffix++;
    }
    return candidate;
  }
  async createNewPost(values) {
    const resolved = await this.resolveNewPostDestination(values.folderPath);
    if (resolved.siteUid !== values.siteUid) {
      throw new Error("Folder Site mapping changed. Reopen New Post and choose the destination again.");
    }
    const category = resolved.categories.find((item) => item.uid === values.category.uid);
    if (!category) {
      throw new Error("The selected Category is no longer available on this Site. Choose it again.");
    }
    const path = this.uniqueNewPostPath(resolved.folderPath, values.title);
    const externalId = uuidV4();
    const content = [
      "---",
      "site_uid: " + yamlQuotedScalar(resolved.siteUid),
      "title: " + yamlQuotedScalar(values.title),
      "excerpt: " + yamlQuotedScalar(values.excerpt ?? ""),
      "status: draft",
      "category: " + yamlQuotedScalar(category.slug),
      "category_uid: " + yamlQuotedScalar(category.uid),
      "external_id: " + externalId,
      "---",
      "",
      ""
    ].join("\n");
    const file = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf(false).openFile(file);
    new import_obsidian.Notice("HakiSend draft created: " + file.path);
  }
  async ensureExternalId(file, frontmatter) {
    const current = typeof frontmatter.external_id === "string" ? frontmatter.external_id.trim() : "";
    if (current) {
      if (current.length > 255) {
        throw new Error(
          "external_id is longer than 255 characters."
        );
      }
      return current;
    }
    const generated = uuidV4();
    await this.app.fileManager.processFrontMatter(
      file,
      (data2) => {
        const existing = typeof data2.external_id === "string" ? data2.external_id.trim() : "";
        if (existing && existing !== generated) {
          throw new Error(
            "external_id changed while saving. Save aborted."
          );
        }
        data2.external_id = generated;
      }
    );
    frontmatter.external_id = generated;
    return generated;
  }
  normalizeLocalMediaTarget(raw) {
    let value = raw.trim();
    if (value.startsWith("<") && value.endsWith(">")) {
      value = value.slice(1, -1);
    }
    try {
      value = decodeURIComponent(
        value
      );
    } catch (e) {
    }
    value = value.replace(
      /[#?].*$/,
      ""
    ).trim();
    if (value.startsWith("/")) {
      value = value.slice(1);
    }
    return value;
  }
  resolveLocalMediaFile(target, sourceFile) {
    const normalized = this.normalizeLocalMediaTarget(
      target
    );
    if (!normalized) {
      throw new Error(
        `Empty local image reference in ${sourceFile.path}.`
      );
    }
    const resolved = this.app.metadataCache.getFirstLinkpathDest(
      normalized,
      sourceFile.path
    );
    if (!resolved || !(resolved instanceof import_obsidian.TFile)) {
      throw new Error(
        `Local image not found: ${target}`
      );
    }
    mediaMimeType(resolved);
    return resolved;
  }
  validateMediaAsset(value) {
    if (!value || typeof value !== "object") {
      throw new Error(
        "HakiSend Media returned an invalid asset."
      );
    }
    const asset = value;
    if (typeof asset.uid !== "string" || !/^[0-9a-fA-F-]{36}$/.test(asset.uid)) {
      throw new Error(
        "HakiSend Media returned an invalid asset UID."
      );
    }
    if (typeof asset.url !== "string" || !/^https?:\/\//i.test(asset.url)) {
      throw new Error(
        "HakiSend Media returned an invalid asset URL."
      );
    }
    if (asset.status && asset.status !== "ready") {
      throw new Error(
        `HakiSend Media asset is not ready: ${asset.status}`
      );
    }
    return asset;
  }
  async resolveMediaByHash(sourceSha256, token) {
    var _a;
    const response = await (0, import_obsidian.requestUrl)({
      url: normalizeBaseUrl(
        this.settings.apiBaseUrl
      ) + "/api/v1/hakisend/media/assets/resolve",
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        source_sha256: sourceSha256
      }),
      throw: false
    });
    const payload = response.json;
    if (response.status < 200 || response.status >= 300 || !(payload == null ? void 0 : payload.success)) {
      throw new Error(
        this.apiErrorMessage(
          response.status,
          response.headers,
          payload == null ? void 0 : payload.error
        )
      );
    }
    if (!((_a = payload.data) == null ? void 0 : _a.found)) {
      return null;
    }
    return this.validateMediaAsset(
      payload.data.asset
    );
  }
  buildMultipartBody(file, bytes, sourceSha256) {
    const boundary = "----HakiSendPublisher" + uuidV4().replace(/-/g, "");
    const mime = mediaMimeType(file);
    const safeName = file.name.replace(
      /["\\\r\n]/g,
      "_"
    );
    const encoder2 = new TextEncoder();
    const head = encoder2.encode(
      `--${boundary}\r
Content-Disposition: form-data; name="source_sha256"\r
\r
${sourceSha256}\r
--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${safeName}"\r
Content-Type: ${mime}\r
\r
`
    );
    const fileBytes = new Uint8Array(bytes);
    const tail = encoder2.encode(
      `\r
--${boundary}--\r
`
    );
    const combined = new Uint8Array(
      head.byteLength + fileBytes.byteLength + tail.byteLength
    );
    combined.set(
      head,
      0
    );
    combined.set(
      fileBytes,
      head.byteLength
    );
    combined.set(
      tail,
      head.byteLength + fileBytes.byteLength
    );
    return {
      body: combined.buffer,
      contentType: `multipart/form-data; boundary=${boundary}`
    };
  }
  async uploadMedia(file, bytes, sourceSha256, token) {
    if (bytes.byteLength > 31457280) {
      throw new Error(
        `Local image is larger than 30 MiB: ${file.path}`
      );
    }
    const multipart = this.buildMultipartBody(
      file,
      bytes,
      sourceSha256
    );
    const response = await (0, import_obsidian.requestUrl)({
      url: normalizeBaseUrl(
        this.settings.apiBaseUrl
      ) + "/api/v1/hakisend/media/assets",
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": multipart.contentType,
        "Authorization": `Bearer ${token}`
      },
      body: multipart.body,
      throw: false
    });
    const payload = response.json;
    if (response.status < 200 || response.status >= 300 || !(payload == null ? void 0 : payload.success) || !payload.data) {
      throw new Error(
        this.apiErrorMessage(
          response.status,
          response.headers,
          payload == null ? void 0 : payload.error
        )
      );
    }
    return this.validateMediaAsset(
      payload.data
    );
  }
  async mediaForFile(file, token, cache) {
    const bytes = await this.app.vault.readBinary(file);
    const sourceSha256 = await sha256Hex(bytes);
    const cached = cache.get(
      sourceSha256
    );
    if (cached) {
      return cached;
    }
    const existing = await this.resolveMediaByHash(
      sourceSha256,
      token
    );
    if (existing) {
      cache.set(
        sourceSha256,
        existing
      );
      return existing;
    }
    const uploaded = await this.uploadMedia(
      file,
      bytes,
      sourceSha256,
      token
    );
    cache.set(
      sourceSha256,
      uploaded
    );
    return uploaded;
  }
  async rewriteWikiImages(markdown, sourceFile, token, cache) {
    const regex = /!\[\[([^\]\n]+)\]\]/g;
    let output = "";
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(markdown)) !== null) {
      const whole = match[0];
      const inner = match[1];
      const parts = inner.split("|");
      const target = parts[0].trim();
      const resolved = this.resolveLocalMediaFile(
        target,
        sourceFile
      );
      const asset = await this.mediaForFile(
        resolved,
        token,
        cache
      );
      let alt = parts.slice(1).join("|").trim();
      if (!alt || /^\d+(?:x\d+)?$/i.test(alt)) {
        alt = resolved.basename;
      }
      output += markdown.slice(
        lastIndex,
        match.index
      );
      output += `![${safeMarkdownAlt(alt)}](${asset.url})`;
      lastIndex = match.index + whole.length;
    }
    output += markdown.slice(
      lastIndex
    );
    return output;
  }
  markdownImageTarget(raw) {
    var _a;
    const value = raw.trim();
    if (value.startsWith("<")) {
      const closing = value.indexOf(">");
      if (closing > 0) {
        return {
          target: value.slice(
            1,
            closing
          ),
          suffix: value.slice(
            closing + 1
          )
        };
      }
    }
    const match = value.match(
      /^(\S+)([\s\S]*)$/
    );
    if (!match) {
      return {
        target: value,
        suffix: ""
      };
    }
    return {
      target: match[1],
      suffix: (_a = match[2]) != null ? _a : ""
    };
  }
  async rewriteMarkdownImages(markdown, sourceFile, token, cache) {
    var _a, _b;
    const regex = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;
    let output = "";
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(markdown)) !== null) {
      const whole = match[0];
      const alt = (_a = match[1]) != null ? _a : "";
      const parsed = this.markdownImageTarget(
        (_b = match[2]) != null ? _b : ""
      );
      output += markdown.slice(
        lastIndex,
        match.index
      );
      if (externalImageTarget(
        parsed.target
      )) {
        output += whole;
        lastIndex = match.index + whole.length;
        continue;
      }
      const resolved = this.resolveLocalMediaFile(
        parsed.target,
        sourceFile
      );
      const asset = await this.mediaForFile(
        resolved,
        token,
        cache
      );
      output += `![${safeMarkdownAlt(alt)}](${asset.url}${parsed.suffix})`;
      lastIndex = match.index + whole.length;
    }
    output += markdown.slice(
      lastIndex
    );
    return output;
  }
  async rewriteLocalImages(markdown, sourceFile, token, cache) {
    let result = await this.rewriteWikiImages(
      markdown,
      sourceFile,
      token,
      cache
    );
    result = await this.rewriteMarkdownImages(
      result,
      sourceFile,
      token,
      cache
    );
    return result;
  }
  async resolveFeaturedImage(value, sourceFile, token, cache) {
    if (value === null || value === void 0 || value === "") {
      return null;
    }
    if (typeof value === "string") {
      let target = value.trim();
      if (/^[0-9a-fA-F-]{36}$/.test(target)) {
        return target;
      }
      if (target.startsWith(
        "![["
      ) && target.endsWith(
        "]]"
      )) {
        target = target.slice(3, -2).split("|")[0].trim();
      }
      if (externalImageTarget(
        target
      )) {
        throw new Error(
          "featured_image must be a local image or a HakiSend Media UID."
        );
      }
      const file = this.resolveLocalMediaFile(
        target,
        sourceFile
      );
      const asset = await this.mediaForFile(
        file,
        token,
        cache
      );
      return {
        uid: asset.uid,
        alt: file.basename
      };
    }
    if (typeof value === "object" && value !== null) {
      const object4 = value;
      if (typeof object4.uid === "string" && /^[0-9a-fA-F-]{36}$/.test(
        object4.uid
      )) {
        return {
          uid: object4.uid,
          alt: typeof object4.alt === "string" ? object4.alt : ""
        };
      }
    }
    throw new Error(
      "featured_image must be a local image path, Media UID, or {uid, alt}."
    );
  }
  async categoriesForSite(siteUid, token) {
    const response = await (0, import_obsidian.requestUrl)({
      url: normalizeBaseUrl(
        this.settings.apiBaseUrl
      ) + "/api/v1/hakisend/sites/" + encodeURIComponent(
        siteUid
      ) + "/categories",
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      },
      throw: false
    });
    const payload = response.json;
    if (response.status < 200 || response.status >= 300 || !(payload == null ? void 0 : payload.success) || !Array.isArray(
      payload.data
    )) {
      throw new Error(
        this.apiErrorMessage(
          response.status,
          response.headers,
          payload == null ? void 0 : payload.error
        )
      );
    }
    return payload.data;
  }
  async resolveCategoryForFile(file, frontmatter, siteUid, token) {
    var _a, _b, _c, _d, _e;
    const categories = await this.categoriesForSite(
      siteUid,
      token
    );
    const categoryRoute = this.findCategoryRoute(file.path, siteUid);
    const pinnedUid = typeof frontmatter.category_uid === "string" ? frontmatter.category_uid.trim() : "";
    const explicitCategory = typeof frontmatter.category === "string" ? frontmatter.category.trim() : "";
    let category;
    if (pinnedUid) {
      category = categories.find((item) => item.uid === pinnedUid);
      if (!category) throw new Error("category_uid does not belong to the selected Site. Choose a Category for this Site.");
    } else if (explicitCategory) {
      const key = explicitCategory.toLowerCase();
      const slugged = simpleSlug(explicitCategory);
      category = categories.find(
        (item) => item.uid === explicitCategory || item.slug.toLowerCase() === key || item.title.toLowerCase() === key || item.slug.toLowerCase() === slugged
      );
      if (!category) throw new Error(`Category "${explicitCategory}" does not exist on this Site.`);
    } else if (categoryRoute) {
      category = categories.find((item) => item.uid === categoryRoute.categoryUid);
      if (!category) throw new Error("The mapped Category is no longer available on the selected Site.");
    } else {
      const folderName = (_c = (_b = (_a = file.parent) == null ? void 0 : _a.name) == null ? void 0 : _b.trim()) != null ? _c : "";
      const key = folderName.toLowerCase();
      const slugged = simpleSlug(folderName);
      category = categories.find(
        (item) => item.uid === folderName || item.slug.toLowerCase() === key || item.title.toLowerCase() === key || item.slug.toLowerCase() === slugged
      );
      if (!category) throw new Error(
        `No Category assigned for folder "${(_e = (_d = file.parent) == null ? void 0 : _d.path) != null ? _e : ""}". Set category_uid, choose a Category in Properties or configure a Category folder mapping.`
      );
    }
    return category;
  }
  buildPostMetadata(file, frontmatter, externalId, siteUid, category) {
    const metadata = {
      title: typeof frontmatter.title === "string" && frontmatter.title.trim() ? frontmatter.title.trim() : file.basename,
      site: siteUid,
      type: "post",
      external_id: externalId,
      category: category.slug
    };
    const scalarFields = [
      "slug",
      "status",
      "excerpt"
    ];
    for (const key of scalarFields) {
      const value = frontmatter[key];
      if (typeof value === "string" && value.trim() !== "") {
        metadata[key] = value.trim();
      }
    }
    const scheduleFields = [
      "publish_at",
      "unpublish_at"
    ];
    for (const key of scheduleFields) {
      if (!Object.prototype.hasOwnProperty.call(
        frontmatter,
        key
      )) {
        continue;
      }
      const value = frontmatter[key];
      if (value === null || typeof value === "string" && value.trim() === "") {
        metadata[key] = null;
        continue;
      }
      if (typeof value === "string") {
        metadata[key] = value.trim();
      }
    }
    if (Object.prototype.hasOwnProperty.call(
      frontmatter,
      "tags"
    )) {
      metadata.tags = normalizeTagValues(
        frontmatter.tags
      );
    }
    return metadata;
  }
  preparePublishNowMetadata(frontmatter) {
    frontmatter.status = "published";
    frontmatter.publish_at = null;
    frontmatter.unpublish_at = null;
  }
  async commitPublishNowFrontmatter(file, postResponse = null) {
    const remoteSlug = authoritativePublishedSlug(postResponse);
    await this.app.fileManager.processFrontMatter(
      file,
      (data2) => {
        data2.status = "published";
        if (remoteSlug) data2.slug = remoteSlug;
        delete data2.publish_at;
        delete data2.unpublish_at;
      }
    );
  }
  async commitScheduleFrontmatter(file, values) {
    await this.app.fileManager.processFrontMatter(
      file,
      (data2) => {
        data2.status = "published";
        data2.publish_at = values.publishAtIso;
        if (values.unpublishAtIso) {
          data2.unpublish_at = values.unpublishAtIso;
        } else {
          delete data2.unpublish_at;
        }
      }
    );
  }
  async saveCurrentNoteCore(publishIntent = false, metadataOverrides = null) {
    var _a;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension.toLowerCase() !== "md") {
      throw new Error(
        "Open a Markdown note before saving to HakiSend."
      );
    }
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error(
        "HakiSend is not connected."
      );
    }
    const cached = this.app.metadataCache.getFileCache(file);
    const frontmatter = (cached == null ? void 0 : cached.frontmatter) ? {
      ...cached.frontmatter
    } : {};
    const siteUid = this.resolveSiteForFile(file, frontmatter);
    if (metadataOverrides) {
      for (const [
        key,
        value
      ] of Object.entries(
        metadataOverrides
      )) {
        frontmatter[key] = value;
      }
    }
    const externalId = await this.ensureExternalId(
      file,
      frontmatter
    );
    if (publishIntent) {
      this.preparePublishNowMetadata(
        frontmatter
      );
    }
    const category = await this.resolveCategoryForFile(
      file,
      frontmatter,
      siteUid,
      token
    );
    const raw = await this.app.vault.read(file);
    let body = stripYamlFrontmatter(
      raw
    );
    body = stripAuthoringInputBlocks(
      body
    );
    const mediaCache = /* @__PURE__ */ new Map();
    body = await this.rewriteLocalImages(
      body,
      file,
      token,
      mediaCache
    );
    if (typeof body !== "string") {
      throw new Error(
        "Internal HakiSend error: Markdown body is not a string."
      );
    }
    const metadata = this.buildPostMetadata(
      file,
      frontmatter,
      externalId,
      siteUid,
      category
    );
    if (Object.prototype.hasOwnProperty.call(
      frontmatter,
      "featured_image"
    )) {
      metadata.featured_image = await this.resolveFeaturedImage(
        frontmatter.featured_image,
        file,
        token,
        mediaCache
      );
    }
    const payload = {
      external: {
        source: "obsidian",
        id: externalId
      },
      metadata,
      content: {
        format: "markdown",
        body
      }
    };
    const response = await (0, import_obsidian.requestUrl)({
      url: normalizeBaseUrl(
        this.settings.apiBaseUrl
      ) + "/api/v1/hakisend/sites/" + encodeURIComponent(
        siteUid
      ) + "/posts/upsert",
      method: "PUT",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(
        payload
      ),
      throw: false
    });
    const result = response.json;
    if (response.status < 200 || response.status >= 300 || !(result == null ? void 0 : result.success) || !result.data) {
      throw new Error(
        this.apiErrorMessage(
          response.status,
          response.headers,
          (_a = result == null ? void 0 : result.error) != null ? _a : {
            message: result == null ? void 0 : result.message
          }
        )
      );
    }
    return {
      file,
      token,
      siteUid,
      post: result.data
    };
  }
  async saveCurrentNote() {
    try {
      const saved = await this.saveCurrentNoteCore(
        false
      );
      new import_obsidian.Notice(
        `HakiSend saved: ${saved.post.operation} \xB7 ${saved.post.uid}`
      );
    } catch (error) {
      new import_obsidian.Notice(
        "HakiSend Save failed: " + this.safeErrorMessage(
          error
        )
      );
    }
  }
  async publishSavedState(saved) {
    var _a;
    const response = await (0, import_obsidian.requestUrl)({
      url: normalizeBaseUrl(
        this.settings.apiBaseUrl
      ) + "/api/v1/hakisend/sites/" + encodeURIComponent(
        saved.siteUid
      ) + "/publish",
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${saved.token}`
      },
      throw: false
    });
    const result = response.json;
    if (response.status < 200 || response.status >= 300 || !(result == null ? void 0 : result.success) || !result.data) {
      throw new Error(
        this.apiErrorMessage(
          response.status,
          response.headers,
          (_a = result == null ? void 0 : result.error) != null ? _a : {
            message: result == null ? void 0 : result.message
          }
        )
      );
    }
    return result.data;
  }
  openScheduleCurrentNote(afterSuccess = null) {
    var _a, _b;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension.toLowerCase() !== "md") {
      new import_obsidian.Notice(
        "Open a Markdown note before scheduling."
      );
      return;
    }
    const frontmatter = (_b = (_a = this.app.metadataCache.getFileCache(
      file
    )) == null ? void 0 : _a.frontmatter) != null ? _b : {};
    const initialPublish = dateFromScheduleValue(
      frontmatter.publish_at
    );
    const initialUnpublish = dateFromScheduleValue(
      frontmatter.unpublish_at
    );
    let focusedSiteUid = "";
    try { focusedSiteUid = this.resolveSiteForFile(file, frontmatter); }
    catch (_error) { /* Show all Sites; the actual Save still validates the Post's Site. */ }
    new HakiSendScheduleModal(
      this.app,
      initialPublish,
      initialUnpublish,
      async (values) => {
        const succeeded = await this.scheduleCurrentNote(
          values
        );
        if (succeeded && typeof afterSuccess === "function") await afterSuccess();
      },
      this,
      focusedSiteUid
    ).open();
  }
  async scheduleCurrentNote(values) {
    let postSaved = false;
    let publicationArmed = false;
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension.toLowerCase() !== "md") {
        throw new Error(
          "Open a Markdown note before scheduling."
        );
      }
      const publishDate = new Date(
        values.publishAtIso
      );
      if (Number.isNaN(
        publishDate.getTime()
      ) || publishDate.getTime() <= Date.now()) {
        throw new Error(
          "Publish time must be in the future."
        );
      }
      if (values.unpublishAtIso) {
        const unpublishDate = new Date(
          values.unpublishAtIso
        );
        if (Number.isNaN(
          unpublishDate.getTime()
        ) || unpublishDate.getTime() <= publishDate.getTime()) {
          throw new Error(
            "Unpublish time must be later than publish time."
          );
        }
      }
      const saved = await this.saveCurrentNoteCore(
        false,
        {
          status: "published",
          publish_at: values.publishAtIso,
          /*
           * Explicit null clears an older expiry on
           * the server even if Obsidian metadata cache
           * has not refreshed yet.
           */
          unpublish_at: values.unpublishAtIso
        }
      );
      postSaved = true;
      const publication = await this.publishSavedState(
        saved
      );
      publicationArmed = true;
      await this.commitScheduleFrontmatter(
        saved.file,
        values
      );
      new import_obsidian.Notice(
        `HakiSend scheduled: ${values.display} \xB7 v${publication.version}`
      );
      return true;
    } catch (error) {
      const prefix = publicationArmed ? "HakiSend Schedule succeeded on HakiSend, but updating local Properties failed: " : postSaved ? "HakiSend Schedule publication failed after saving the Post; local Properties were not changed. Retry Schedule to arm it live: " : "HakiSend Schedule failed; local publishing Properties were not changed: ";
      new import_obsidian.Notice(
        prefix + this.safeErrorMessage(
          error
        )
      );
      return false;
    }
  }
  async publishCurrentNote() {
    let postSaved = false;
    let publicationPublished = false;
    try {
      const saved = await this.saveCurrentNoteCore(
        true
      );
      postSaved = true;
      const publication = await this.publishSavedState(
        saved
      );
      publicationPublished = true;
      await this.commitPublishNowFrontmatter(
        saved.file,
        saved.post
      );
      if (publication.operation === "unchanged") {
        new import_obsidian.Notice(
          `HakiSend publication unchanged: v${publication.version} \xB7 ${publication.publication_uid}`
        );
        return;
      }
      new import_obsidian.Notice(
        `HakiSend published: v${publication.version} \xB7 ${publication.publication_uid}`
      );
    } catch (error) {
      const prefix = publicationPublished ? "HakiSend Publish succeeded on HakiSend, but updating local Properties failed: " : postSaved ? "HakiSend Publish failed after saving the Post; local publishing Properties were not changed: " : "HakiSend Publish failed; local publishing Properties were not changed: ";
      new import_obsidian.Notice(
        prefix + this.safeErrorMessage(
          error
        )
      );
    }
  }
  async openPublishedPostEmailNotice() {
    try {
      let file = this.app.workspace.getActiveFile();
      if (!file || file.extension !== "md")
        throw Error("Hãy mở bài viết Post cần thông báo.");
      if (!this.hasSecureConnection())
        throw Error("Cần kết nối HakiSend với quyền đọc danh sách email.");
      // Refresh the authorized Site list as a read-only call. Existing Vaults
      // may still cache records from before the public_origin API field.
      try {
        await this.discoverSites();
      } catch (error) {
        new import_obsidian.Notice("Chưa cập nhật được domain từ HakiSend; đang dùng thông tin Site đã lưu trong Vault.");
      }
      let expectedPostUid = "";
      if (file.path.startsWith("HakiSend Emails/")) {
        const draftRaw = await this.app.vault.read(file);
        const draftFields = localEmailFieldsFromRaw(draftRaw,
          this.app.metadataCache.getFileCache(file)?.frontmatter || {});
        const sourcePath = draftFields.hakisend_post_notice_source_path;
        expectedPostUid = draftFields.hakisend_post_notice_post_uid || "";
        if (typeof sourcePath !== "string" || !sourcePath.endsWith(".md") ||
          sourcePath.startsWith("/") || sourcePath.includes("\\") ||
          sourcePath.startsWith("HakiSend Emails/") || sourcePath.startsWith("HakiSend Imports/") ||
          sourcePath.split("/").some((part) => !part || part === "." || part === "..") ||
          !validUuid(expectedPostUid))
          throw Error("Bản nháp chưa liên kết Post gốc hợp lệ. Hãy mở Post gốc để tạo email cho List khác.");
        const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!sourceFile || sourceFile.path !== sourcePath || sourceFile.extension !== "md")
          throw Error("Không tìm thấy Post gốc trong Vault: " + sourcePath);
        file = sourceFile;
        await this.app.workspace.getLeaf(false).openFile(file);
        new import_obsidian.Notice("Đã mở Post gốc. Chọn List chưa gửi để tạo email thông báo mới.");
      }
      const raw = await this.app.vault.read(file);
      const fields = localEmailFieldsFromRaw(raw, this.app.metadataCache.getFileCache(file)?.frontmatter || {});
      if (fields.hakisend_import_snapshot === true || fields.hakisend_read_only === true ||
        file.path.startsWith("HakiSend Imports/") || file.path.startsWith("HakiSend Emails/"))
        throw Error("Hãy mở bài Post gốc, không phải bản sao hoặc bản nháp email.");
      if (!publishedPostStatus(fields.status) || typeof fields.external_id !== "string" || !validUuid(fields.external_id))
        throw Error("Post cần có trạng thái publish/published và external_id hợp lệ.");
      // Category and Slug are resolved from the saved Post on HakiSend.
      // Older local notes may omit both and must not be modified here.
      if (!this.settings.sites.length)
        throw Error("Hãy kết nối HakiSend Sites trước khi tạo email.");
      const pinned = typeof fields.site_uid === "string" && fields.site_uid.trim() ||
        typeof fields.site === "string" && fields.site.trim();
      const routed = (this.settings.folderSiteMappings || []).some((route) => pathIsWithinFolder(file.path, route.folderPath));
      // Only a sole authorized Site is unambiguous for legacy Post metadata;
      // multiple Sites still require an explicit selection or folder route.
      const siteUid = pinned || routed || this.settings.sites.length === 1
        ? this.resolveSiteForFile(file, fields) : "";
      if (siteUid && !this.settings.sites.some((row) => row.uid === siteUid))
        throw Error("Site của Post không còn được kết nối.");
      new HakiSendPublishedPostNoticeModal(this.app, this, file, raw, fields, siteUid, expectedPostUid).open();
    } catch (e) {
      new import_obsidian.Notice("Chưa thể tạo email từ Post: " + String(e).slice(0, 220));
    }
  }
  async showCurrentPostStatus() {
    var _a, _b, _c, _d;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension.toLowerCase() !== "md") {
      new import_obsidian.Notice(
        "Open a Markdown note to view HakiSend status."
      );
      return;
    }
    const cached = this.app.metadataCache.getFileCache(
      file
    );
    const frontmatter = (cached == null ? void 0 : cached.frontmatter) ? {
      ...cached.frontmatter
    } : {};
    const rawStatus = typeof frontmatter.status === "string" ? frontmatter.status.trim().toLowerCase() : "";
    const publishAt = dateFromScheduleValue(
      frontmatter.publish_at
    );
    const unpublishAt = dateFromScheduleValue(
      frontmatter.unpublish_at
    );
    const now = Date.now();
    let state = "Draft";
    if (rawStatus === "published" || rawStatus === "publish") {
      if (publishAt && publishAt.getTime() > now) {
        state = "Scheduled";
      } else if (unpublishAt && unpublishAt.getTime() <= now) {
        state = "Expired";
      } else {
        state = "Published";
      }
    } else if (rawStatus && rawStatus !== "draft") {
      state = "Legacy status: " + rawStatus;
    }
    const category = typeof frontmatter.category === "string" && frontmatter.category.trim() ? frontmatter.category.trim() : ((_b = (_a = file.parent) == null ? void 0 : _a.name) == null ? void 0 : _b.trim()) || "not set";
    const slug = typeof frontmatter.slug === "string" && frontmatter.slug.trim() ? frontmatter.slug.trim() : "automatic";
    const externalId = typeof frontmatter.external_id === "string" ? frontmatter.external_id.trim() : "";
    const identity = externalId ? "reserved" : "not reserved";
    const scheduleParts = [];
    if (state === "Scheduled" && publishAt) {
      scheduleParts.push(
        "publish " + publishAt.toLocaleString()
      );
    }
    if (unpublishAt) {
      scheduleParts.push(
        "unpublish " + unpublishAt.toLocaleString()
      );
    }
    let destination = "unresolved";
    try {
      const uid3 = this.resolveSiteForFile(file, frontmatter);
      destination = (_d = (_c = this.settings.sites.find((site) => site.uid === uid3)) == null ? void 0 : _c.name) != null ? _d : uid3;
    } catch (error) {
      destination = this.safeErrorMessage(error);
    }
    const lines = [
      "Site: " + destination,
      "HakiSend local state: " + state,
      "Category: " + category,
      "Slug: " + slug,
      "Identity: " + identity
    ];
    if (scheduleParts.length) {
      lines.push(
        "Schedule: " + scheduleParts.join(
          " \xB7 "
        )
      );
    }
    new import_obsidian.Notice(
      lines.join("\n"),
      8e3
    );
  }
  async testConnection() {
    try {
      const sites = await this.discoverSites();
      new import_obsidian.Notice(
        `HakiSend connection OK. ${sites.length} Site(s) available.`
      );
    } catch (error) {
      new import_obsidian.Notice(
        "HakiSend connection failed: " + this.safeErrorMessage(error)
      );
    }
  }
  apiErrorMessage(status, headers, error) {
    var _a, _b, _c, _d, _e;
    const requestId = (_e = (_d = (_c = (_b = (_a = headers["x-hakisend-request-id"]) != null ? _a : headers["X-HakiSend-Request-ID"]) != null ? _b : headers["x-request-id"]) != null ? _c : headers["X-Request-Id"]) != null ? _d : headers["x-requestid"]) != null ? _e : "";
    const code = (error == null ? void 0 : error.code) ? ` ${error.code}` : "";
    const message = (error == null ? void 0 : error.message) ? ` \u2014 ${error.message}` : "";
    const request2 = requestId ? ` [request ${requestId}]` : "";
    return `HTTP ${status}${code}${message}${request2}`;
  }
  safeErrorMessage(error) {
    if (error instanceof Error) {
      return error.message;
    }
    return "Unknown error.";
  }
};
var HakiSendPublisherSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    var _a, _b, _c, _d;
    const {
      containerEl
    } = this;
    containerEl.empty();
    const secure = this.plugin.hasSecureConnection();
    const legacy = this.plugin.hasLegacyToken();
    new import_obsidian.Setting(containerEl).setName("Connection").setDesc(
      secure ? "Connected securely to HakiSend." : legacy ? "Legacy token detected. Connect through the browser to move to secure storage." : "Not connected."
    ).addButton((button) => {
      button.setButtonText(
        secure ? "Reconnect" : "Connect to HakiSend"
      ).setCta().onClick(
        async () => {
          await this.plugin.startBrowserConnect();
        }
      );
    });
    if (secure) {
      new import_obsidian.Setting(containerEl).setName("Email Draft Access").setDesc("Request only email:read and email:compose in addition to existing publishing scopes. A declined or failed reconnection keeps your current token. This never grants email:send or email:schedule.").addButton((button) => button.setButtonText("Reconnect with Email Draft Access").onClick(async () => {
        await this.plugin.startBrowserConnect(true);
      }));
    }
    if (secure || legacy) {
      new import_obsidian.Setting(containerEl).setName(
        "Test connection"
      ).setDesc(
        "Verify credentials and refresh available Sites."
      ).addButton(
        (button) => {
          button.setButtonText(
            "Test connection"
          ).onClick(
            async () => {
              await this.plugin.testConnection();
            }
          );
        }
      );
    }
    if (secure) {
      new import_obsidian.Setting(containerEl).setName("Disconnect").setDesc(
        "Remove the HakiSend credential from Obsidian."
      ).addButton(
        (button) => {
          button.setButtonText(
            "Disconnect"
          ).setWarning().onClick(
            async () => {
              await this.plugin.disconnect();
            }
          );
        }
      );
    }
    new import_obsidian.Setting(containerEl).setName(
      "HakiSend API base URL"
    ).setDesc(
      "HTTPS origin only (normally https://app.hakisend.com). No path, query or credentials. Invalid entries block API requests."
    ).addText((text) => {
      text.setPlaceholder(
        "https://app.hakisend.com"
      ).setValue(
        this.plugin.settings.apiBaseUrl
      ).onChange(
        async (value) => {
          // Editing may temporarily produce an incomplete URL. Store it for
          // correction, but credentialed requests will fail closed until valid.
          this.plugin.settings.apiBaseUrl = value.trim();
          await this.plugin.saveSettings();
        }
      );
    });
    const sites = this.plugin.settings.sites;
    containerEl.createEl("h3", { text: "Tên miền công khai của từng Site" });
    containerEl.createEl("p", {
      text: "HakiSend sẽ tự điền URL Post từ tên miền Site, Category và Slug. Chỉ cần cấu hình tên miền một lần nếu API chưa cung cấp.",
      cls: "setting-item-description"
    });
    for (const site of sites) {
      const resolved = publicOriginForSite(site, this.plugin.settings, site.uid);
      if (Object.prototype.hasOwnProperty.call(site, "public_origin")) {
        new import_obsidian.Setting(containerEl).setName(site.name)
          .setDesc(resolved
            ? "Tên miền tự động từ HakiSend: " + resolved + ". Không cần nhập hoặc lưu lại trong Vault."
            : "HakiSend chưa có URL công khai đang hoạt động cho Site này. Kiểm tra domain và Publish Site trên HakiSend.");
        continue;
      }
      let draftOrigin = this.plugin.settings.sitePublicOrigins?.[site.uid] || "";
      new import_obsidian.Setting(containerEl).setName(site.name)
        .setDesc(resolved ? "Tên miền đang dùng: " + resolved : "Chưa nhận được tên miền từ API; nhập một lần rồi lưu.")
        .addText((t) => t.setPlaceholder("https://tenmiencuasite.com").setValue(draftOrigin)
          .onChange((v) => { draftOrigin = v; }))
        .addButton((b) => b.setButtonText("Lưu tên miền").onClick(async () => {
          const input = draftOrigin.trim();
          const origin = input ? normalizePublicSiteOrigin(input) : "";
          if (input && !origin) {
            new import_obsidian.Notice("Chỉ chấp nhận tên miền Site công khai dùng HTTPS, không có đường dẫn.");
            return;
          }
          if (!this.plugin.settings.sitePublicOrigins) this.plugin.settings.sitePublicOrigins = {};
          if (origin) this.plugin.settings.sitePublicOrigins[site.uid] = origin;
          else delete this.plugin.settings.sitePublicOrigins[site.uid];
          await this.plugin.saveSettings();
          this.display();
        }));
    }
    containerEl.createEl("h3", { text: "Folder \u2192 Site publishing routes" });
    containerEl.createEl("p", {
      text: "Subfolders inherit the closest parent route. site_uid in note Properties overrides routes.",
      cls: "setting-item-description"
    });
    for (const route of this.plugin.settings.folderSiteMappings) {
      new import_obsidian.Setting(containerEl).setName(route.folderPath).addDropdown((dropdown) => {
        for (const site of sites) dropdown.addOption(site.uid, site.name);
        dropdown.setValue(route.siteUid);
        dropdown.onChange(async (value) => {
          route.siteUid = value;
          await this.plugin.saveSettings();
        });
      }).addButton((button) => button.setButtonText("Remove").onClick(async () => {
        this.plugin.settings.folderSiteMappings = this.plugin.settings.folderSiteMappings.filter((item) => item !== route);
        await this.plugin.saveSettings();
        this.display();
      }));
    }
    let newFolder = "";
    let newSite = (_b = (_a = sites[0]) == null ? void 0 : _a.uid) != null ? _b : "";
    const newRouteSetting = new import_obsidian.Setting(containerEl).setName("Add folder route").setDesc("Choose an existing Obsidian folder.");
    newRouteSetting.addButton((button) => button.setButtonText("Choose folder\u2026").onClick(() => new HakiSendFolderPicker(this.app, (folder) => {
      newFolder = folder.path;
      newRouteSetting.setDesc(folder.path);
    }).open())).addDropdown((dropdown) => {
      for (const site of sites) dropdown.addOption(site.uid, site.name);
      if (newSite) dropdown.setValue(newSite);
      dropdown.onChange((value) => {
        newSite = value;
      });
    }).addButton((button) => button.setButtonText("Add route").onClick(async () => {
      const folder = normalizeFolderPath(newFolder);
      if (!folder || !newSite) {
        new import_obsidian.Notice("Select a folder and a Site.");
        return;
      }
      const target = this.app.vault.getAbstractFileByPath(folder);
      if (!target || !(target instanceof import_obsidian.TFolder)) {
        new import_obsidian.Notice("Choose a valid folder from this Obsidian vault.");
        return;
      }
      this.plugin.settings.folderSiteMappings = this.plugin.settings.folderSiteMappings.filter((item) => item.folderPath !== folder);
      this.plugin.settings.folderSiteMappings.push({ folderPath: folder, siteUid: newSite });
      await this.plugin.saveSettings();
      this.display();
    }));
    containerEl.createEl("h3", { text: "Category folder mappings" });
    containerEl.createEl("p", {
      text: "A Category is specific to one HakiSend Site. Map each Category folder to its actual server Category UID. Child folders inherit the mapping.",
      cls: "setting-item-description"
    });
    for (const route of this.plugin.settings.folderCategoryMappings) {
      const site = sites.find((candidate) => candidate.uid === route.siteUid);
      new import_obsidian.Setting(containerEl).setName(route.folderPath).setDesc(((_c = site == null ? void 0 : site.name) != null ? _c : "Unavailable Site") + " \u2192 " + ((_d = route.categoryTitle) != null ? _d : route.categoryUid)).addButton((button) => button.setButtonText("Remove").onClick(async () => {
        this.plugin.settings.folderCategoryMappings = this.plugin.settings.folderCategoryMappings.filter((item) => item !== route);
        await this.plugin.saveSettings();
        this.display();
      }));
    }
    new import_obsidian.Setting(containerEl).setName("Map a Category folder").setDesc("Select the folder, parent Site, and a real Category from HakiSend.").addButton((button) => button.setButtonText("Add Category mapping").onClick(() => this.plugin.openAddCategoryRouteModal()));
    new import_obsidian.Setting(containerEl).setName("Default Site").setDesc(
      sites.length ? "Site used by default when a note does not specify another Site." : "Connect or test the connection to load Sites."
    ).addDropdown(
      (dropdown) => {
        dropdown.addOption(
          "",
          sites.length ? "Choose a Site" : "No Sites loaded"
        );
        for (const site of sites) {
          dropdown.addOption(
            site.uid,
            site.name
          );
        }
        dropdown.setValue(
          this.plugin.settings.defaultSiteUid
        );
        dropdown.onChange(
          async (value) => {
            this.plugin.settings.defaultSiteUid = value;
            await this.plugin.saveSettings();
          }
        );
      }
    );
    new import_obsidian.Setting(containerEl).setName("Lệnh kỹ thuật nâng cao")
      .setDesc("Mặc định ẩn các lệnh thử nghiệm, chẩn đoán và khôi phục kỹ thuật khỏi khay lệnh. Bật chỉ khi cần hỗ trợ chuyên sâu; khởi động lại plugin để áp dụng.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.uiAdvancedCommands === true).onChange(async (value) => {
        this.plugin.settings.uiAdvancedCommands = value === true;
        await this.plugin.saveSettings();
        new import_obsidian.Notice("Khởi động lại HakiSend Publisher để cập nhật khay lệnh.");
      }));
  }
};
