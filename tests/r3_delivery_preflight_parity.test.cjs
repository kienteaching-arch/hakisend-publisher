const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const serverRequired = [
  'site_audience', 'native_state', 'source_content_integrity',
  'membership_guest_free_attestation', 'campaign_permission',
  'native_setup', 'sender', 'unsubscribe', 'native_recipient_count', 'credit'
];

test('both Obsidian delivery previews require every server-side preflight gate', () => {
  const deliveryModal = source.slice(
    source.indexOf('var HakiSendR3NativeDeliveryModal = class'),
    source.indexOf('var HakiSendR3MultichannelPlanModal = class')
  );
  const lists = [...deliveryModal.matchAll(/const required2 = \[([\s\S]*?)\];/g)]
    .map((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]));
  assert.equal(lists.length, 2, 'pinned and manually-selected Campaign flows');
  for (const list of lists) {
    assert.deepEqual(list, serverRequired);
  }
  assert.match(deliveryModal, /Vui lòng xử lý các mục sau rồi kiểm tra lại/);
  assert.match(deliveryModal, /status\?\.state !== "pass"/);
  assert.match(deliveryModal, /problems\.add\(help\[key\]\)/);
  assert.match(deliveryModal, /Check existing request \(read-only\)/);
  assert.match(deliveryModal, /await this\.recover\(prior\)/);
});

test('HTTP 422 reports safe server error code and never retries the delivery POST', async () => {
  const start = source.indexOf('async function sendR3Once(');
  const end = source.indexOf('async function readR3Receipt(', start);
  assert(start >= 0 && end > start);
  const sandbox = {
    validateR3Payload: () => {}, url: () => 'https://example.test/delivery',
    auth: () => 'Bearer test', receipt: () => { throw Error('not expected'); }
  };
  vm.runInNewContext(source.slice(start, end), sandbox);
  let requests = 0;
  let persisted = 0;
  const fakeRequest = async (request) => {
    requests++;
    assert.equal(request.method, 'POST');
    return {
      status: 422,
      json: { success: false, error: { code: 'DELIVERY_PREFLIGHT_BLOCKED_membership_guest_free_attestation' } }
    };
  };
  const payload = { request_uid: 'request-1', recipient_count_snapshot: 1, approval_confirmed: true };
  await assert.rejects(
    sandbox.sendR3Once(fakeRequest, 'https://example.test', 'site-1', 'campaign-1', 'token',
      'send_now', payload, async () => { persisted++; }),
    /HTTP 422 \(DELIVERY_PREFLIGHT_BLOCKED_membership_guest_free_attestation\): recover via receipt GET, never resend/
  );
  assert.equal(persisted, 1);
  assert.equal(requests, 1);
});
