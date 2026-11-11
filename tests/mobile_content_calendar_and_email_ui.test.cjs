const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtime = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

test('native content calendar uses labeled, compact mobile controls', () => {
  const start = runtime.indexOf('var HakiSendNativeContentCalendarModal = class');
  const end = runtime.indexOf('var HakiSendR3LocalMultichannelCalendarModal = class', start);
  assert(start >= 0 && end > start);
  const body = runtime.slice(start, end);
  assert.match(body, /hks-native-calendar-filters/);
  assert.match(body, /Trang web/);
  assert.match(body, /Nội dung/);
  assert.match(body, /Tháng trước/);
  assert.match(body, /Tháng sau/);
  assert.match(body, /hks-native-calendar-grid/);
  assert.match(body, /aria-pressed/);
  assert.match(body, /hks-native-calendar-event-row/);
  assert.doesNotMatch(body, /setButtonText\("◀"\)/);
  assert.match(styles, /\.hks-native-calendar-filters\s*\{\s*display:\s*grid/);
  assert.match(styles, /\.hks-native-content-calendar \.hks-native-calendar-grid\s*\{\s*display:\s*grid/);
  assert.match(styles, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
});

test('ordinary email approval hides internal diagnostics but keeps all preflight gates', () => {
  const start = runtime.indexOf('var HakiSendR3NativeDeliveryModal = class');
  const end = runtime.indexOf('var HakiSendR3LocalMultichannelCalendarModal = class', start);
  assert(start >= 0 && end > start);
  const body = runtime.slice(start, end);
  const pinnedEndUser = body.slice(0, body.indexOf('    new import_obsidian.Setting(root).setName("HakiSend Site")'));
  assert.doesNotMatch(pinnedEndUser, /Xem kết quả kiểm tra kỹ thuật/);
  assert.match(pinnedEndUser, /required2\.every/);
  assert.match(pinnedEndUser, /status\?\.state !== "pass"/);
  assert.match(pinnedEndUser, /if \(!allowed\)/);
  assert.match(body, /hakisend-email-schedule-fields/);
  assert.match(body, /Ngày gửi/);
  assert.match(body, /Giờ gửi/);
  assert.match(styles, /\.hakisend-email-schedule-fields\s*\{\s*display:\s*grid/);
});
