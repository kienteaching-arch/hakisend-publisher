const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('default command palette contains only clear, English end-user actions', () => {
  const start = source.indexOf('var HAKISEND_END_USER_COMMANDS = Object.freeze(');
  const end = source.indexOf('var HakiSendPublisherPlugin = class', start);
  assert(start >= 0 && end > start);
  const sandbox = {};
  vm.runInNewContext(source.slice(start, end), sandbox);
  const labels = sandbox.HAKISEND_END_USER_COMMANDS;
  assert.equal(Object.keys(labels).length, 10);
  assert.equal(new Set(Object.values(labels)).size, 10);
  for (const name of Object.values(labels)) {
    assert(!name.startsWith('HakiSend'), 'Obsidian already prefixes the plugin name');
    assert(!/(candidate|preflight|R3|read-only|GET only)/i.test(name));
  }
  assert.equal(labels['open-hakisend-website-email-calendar'], 'Content calendar (Website + Email)');
  assert.equal(labels['edit-post-properties'], 'Edit post properties');
  assert.match(source, /uiAdvancedCommands: false/);
  const helper = source.slice(source.indexOf('  registerUserCommand(command) {'), source.indexOf('  async onload() {', source.indexOf('  registerUserCommand(command) {')));
  assert.match(helper, /return this\.addCommand\(\{ \.\.\.command, name: simplified \}\)/);
  assert.match(helper, /this\.settings\.uiAdvancedCommands === true/);
  assert.doesNotMatch(helper, /this\.registerUserCommand\(/);
  const activeRegistration = [...source.matchAll(/this\.registerUserCommand\(\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert(activeRegistration.length >= 30);
  for (const id of Object.keys(labels)) assert(activeRegistration.includes(id));
  assert.match(source, /new HakiSendNativeContentCalendarModal\(this\.app, this\)\.open\(\)/);
  assert.match(source, /this\.modalEl\.addClass\("hks-post-calendar-modal"\)/);
  assert.match(source, /Email calendar isn't available yet\./);
  assert.match(source, /Site details/);
  assert.match(source, /Local drafts \(/);
  const styles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(styles, /\.hks-post-calendar-modal \.modal-content\s*\{/);
  assert.match(styles, /\.hks-content-calendar-status/);
});

test('native Calendar accepts only owner-scoped, non-mutating bounded snapshots', () => {
  const start = source.indexOf('function acceptNativeContentCalendar(');
  const end = source.indexOf('function nativeContentCalendarLabel(', start);
  assert(start >= 0 && end > start);
  const sandbox = {};
  vm.runInNewContext(source.slice(start, end), sandbox);
  const siteUid = '18b25272-880a-42b7-a450-6a46e4bfb090';
  const days = Array.from({ length: 42 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10),
    items: i === 0 ? [
      { kind: 'post', uid: '4ee6e2d0-cbb0-46eb-9072-2d394ef24ae4', title: 'Website post', time: '09:30', state: 'post_planned' },
      { kind: 'email', uid: '6f0a9a3b81c23', title: 'Test email', time: '10:15', state: 'campaign_scheduled_native' }
    ] : []
  }));
  const input = { success: true, data: {
    contract_version: 'hks_publisher_calendar_browse_v1', site_uid: siteUid,
    read_only: true, send_authorized: false, schedule_authorized: false,
    days, window_truncated: false
  } };
  const accepted = sandbox.acceptNativeContentCalendar(input, siteUid);
  assert.equal(accepted.events.length, 2);
  assert.equal(accepted.events[1].kind, 'email');
  assert.equal(accepted.events[1].serverConfirmed, true);
  assert.throws(() => sandbox.acceptNativeContentCalendar(input, 'wrong-site'));
  assert.throws(() => sandbox.acceptNativeContentCalendar({ ...input, data: { ...input.data, send_authorized: true } }, siteUid));
  assert.throws(() => sandbox.acceptNativeContentCalendar({ ...input, data: { ...input.data, days: [] } }, siteUid));
  const forged = days.map((d) => ({ ...d }));
  forged[0].items = [{ kind: 'facebook', uid: '1234567', title: 'X', time: '10:00', state: 'post_planned' }];
  assert.throws(() => sandbox.acceptNativeContentCalendar({ ...input, data: { ...input.data, days: forged } }, siteUid));
});
