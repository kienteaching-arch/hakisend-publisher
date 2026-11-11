const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const between = (start, end) => {
  const i = source.indexOf(start);
  const j = source.indexOf(end, i + start.length);
  assert(i >= 0 && j > i, `Missing function ${start}`);
  return source.slice(i, j);
};

// New plans may not create Facebook page actions, including crafted callers.
const context = {};
vm.createContext(context);
vm.runInContext(between('function createR3LocalPlan(', 'function renderR3LocalPlan('), context);
assert.throws(() => context.createR3LocalPlan({
  mode: 'post', lists: [], pages: [{pageId: '123'}]
}), /Facebook publishing is deferred/);

const calendarLoader = between('  async loadUnifiedPublishingCalendar(', '  async openFacebookPublishing(');
assert.match(calendarLoader, /return this\.loadPublishingPostCalendar\(siteUid,from,to\)/);
assert.doesNotMatch(calendarLoader, /facebookApi/);
const facebookApi = between('  async facebookApi(', '  async loadUnifiedPublishingCalendar(');
assert.doesNotMatch(facebookApi, /requestUrl/);
assert.match(facebookApi, /tạm ngừng/);
assert(!source.includes('id: "facebook-publish-multiple-pages"'));
assert(!source.includes('setName("Facebook Fanpages")'));
assert(!source.includes('["facebook_page_post", "Facebook Fanpage"]'));
assert(source.includes('id: "view-post-publishing-calendar"'));
assert(source.includes('id: "open-hakisend-website-email-calendar"'));
assert(source.includes('"/rui/publisher-email/calendar?type=all&view=month"'));
assert(source.includes('id: "r3-view-local-multichannel-plan-calendar"'));
assert(source.includes('name: "HakiSend: View Unified Calendar (read-only candidate)"'));
assert(source.includes('rawCal.entries.filter((e) => e.kind !== "facebook_page_post")'));

// Reader remains backward compatible: historical locally saved Facebook plans
// are not destroyed or rewritten simply by installing this release.
assert(source.includes('"facebook_page_post"]')); 
assert(source.includes('function readR3LocalPlanNote('));
console.log('PASS: Facebook deferred; Website and Email Calendars retained; historical plans untouched');
