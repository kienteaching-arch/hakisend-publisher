const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('mobile native calendar has explicit tracks for every one of the six weeks', () => {
  const native = runtime.slice(runtime.indexOf('var HakiSendNativeContentCalendarModal = class'));
  assert.match(native, /for \(let i = 0; i < 42; i\+\+\)/);
  assert.match(native, /hks-post-calendar-grid hks-native-calendar-grid/);

  const mobile = styles.slice(styles.indexOf('@media (max-width: 680px)'));
  const gridRule = mobile.match(/\.hks-native-content-calendar \.hks-native-calendar-grid\s*\{([^}]+)\}/);
  assert.ok(gridRule, 'mobile calendar grid rule must exist');
  assert.match(gridRule[1], /grid-template-rows:\s*40px repeat\(6, 46px\)/);
  assert.match(gridRule[1], /max-height:\s*none/);
  assert.match(gridRule[1], /overflow:\s*visible/);

  const dayRule = mobile.match(/\.hks-native-content-calendar \.hks-native-calendar-day\s*\{([^}]+)\}/);
  assert.ok(dayRule, 'mobile day rule must exist');
  assert.match(dayRule[1], /height:\s*46px/);
  assert.match(dayRule[1], /min-height:\s*46px/);
  assert.match(dayRule[1], /max-height:\s*46px/);
});

test('calendar remains read-only and uses outer modal scrolling', () => {
  assert.match(styles, /\.hks-post-calendar-modal \.modal-content\s*\{\s*overflow-y:\s*auto/);
  const nativeStart = runtime.indexOf('var HakiSendNativeContentCalendarModal = class');
  const nextClass = runtime.indexOf('var HakiSendR3EmailWizardModal = class', nativeStart);
  assert.ok(nativeStart >= 0 && nextClass > nativeStart);
  const native = runtime.slice(nativeStart, nextClass);
  assert.match(native, /this\.plugin\.loadNativeContentCalendar/);
  assert.match(native, /aria-label/);
});
