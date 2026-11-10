const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const between = (begin, end) => {
  const a = source.indexOf(begin);
  const b = source.indexOf(end, a + begin.length);
  assert(a >= 0 && b > a, `Missing bundled function: ${begin}`);
  return source.slice(a, b);
};
const url = 'https://site.example.com/parenting/my-post';

// Prove that 30 KB of actual Free content remains intact and that an
// oversized guest page is REFUSED, never silently clipped to 12 KB.
const readVisible = between('function publicMembershipExcerptFromPage(', 'function publicPostPageShowsTitle(');
const page = (visibleText) => {
  const article = {
    childNodes: [{ nodeType: 3, nodeValue: visibleText }],
    querySelector: () => null
  };
  return {
    querySelector: (selector) => {
      if (selector === 'link[rel="canonical"]') return { getAttribute: () => url };
      if (selector.includes('h1.hs-article-title')) return { textContent: 'Title' };
      return null;
    },
    querySelectorAll: () => [article]
  };
};
let dom = page('Nội dung miễn phí '.repeat(2000));
const publicContext = {
  DOMParser: class { parseFromString() { return dom; } },
  URL, TextEncoder,
  publicPostPageShowsTitle: () => true
};
vm.createContext(publicContext);
vm.runInContext(readVisible, publicContext);
const result = publicContext.publicMembershipExcerptFromPage('<html></html>', 'Title', url);
assert(result.freeContent.length > 12000);
assert.equal(result.shortened, false);
assert.equal(result.freeContent, dom.querySelectorAll()[0].childNodes[0].nodeValue.trim());
dom = page('Nội dung miễn phí '.repeat(8000));
assert.throws(() => publicContext.publicMembershipExcerptFromPage('<html></html>', 'Title', url), /100 KB/);

// The chosen List name must be retained in the standalone email plan.
const compose = between('function createPublishedPostEmailNotice(', '/**\n * Parse ONLY the visible article body');
const composeContext = {
  URL, TextEncoder,
  validUuid: () => true,
  publishedPostStatus: () => true,
  requireField: (x) => String(x || '').trim(),
  createEmailOnlyPlanFromMarkdown: () => ({ planMarkdown:
    'email_list_uid: "listX"\nemail_list_name: ""\nemail_store_on_hakisend: false\n', body: 'b' })
};
vm.createContext(composeContext);
vm.runInContext(compose, composeContext);
const notice = composeContext.createPublishedPostEmailNotice({
  siteUid: '123', status: 'published', sourcePath: 'Post.md', readOnly: false,
  postTitle: 'Title', postUid: '123', subject: 'Subject', preheader: '',
  publicUrl: url, category: 'parenting', postSlug: 'my-post', serverVerified: true,
  confirmedPublic: true, sourceMarkdown: '# Title', guestPreviewVerified: true,
  excerptSource: 'membership_guest_page',
  publicExcerpt: 'Toàn bộ phần Free', publicSummary: '', publicFreeContent: 'Toàn bộ phần Free',
  listUid: 'listX', listName: 'Parents VN'
});
assert(notice.planMarkdown.includes('email_list_name: "Parents VN"'));
assert.equal(notice.excerpt, 'Toàn bộ phần Free');

// R3's new-plan validation rejects concurrent recipients while preserving the old
// stored plan-reader contract for existing notes.
const r3Create = between('function createR3LocalPlan(', 'function renderR3LocalPlan(');
const r3Context = {};
vm.createContext(r3Context);
vm.runInContext(r3Create, r3Context);
assert.throws(() => r3Context.createR3LocalPlan({
  mode: 'email_only', lists: [{ listUid: 'one' }, { listUid: 'two' }], pages: []
}), /at most one Email List/);
assert(source.includes('this.lists.length >= 1'), 'R3 Add List UI must stop at one');

// Exercise the real compiled Post Notice modal, including authorization refresh.
const modalCode = between('var HakiSendPublishedPostNoticeModal = class extends import_obsidian.Modal {', 'var HakiSendCloudSyncModal =');
const toggles = new Map();
class Setting {
  setName(value) { this.name = value; return this; }
  addToggle(callback) {
    const control = {
      value: false,
      setValue(value) { this.value = value; return this; },
      onChange(fn) { this.change = fn; return this; }
    };
    toggles.set(this.name, control);
    callback(control);
    return this;
  }
  addText(callback) {
    callback({ setValue() { return this; }, onChange() { return this; } });
    return this;
  }
}
const context = {
  import_obsidian: { Modal: class { constructor(app) { this.app = app; } }, Setting, Notice: class {} },
  publishedPostCategory: () => 'parenting',
  isAudience: (row) => typeof row?.uid === 'string' && typeof row?.post_notice_reserved === 'boolean'
};
vm.createContext(context);
vm.runInContext(modalCode + '\nthis.Modal = HakiSendPublishedPostNoticeModal;', context);
const uid = 'c125380f-6de1-4869-b10f-4162ec209f0e';
const postUid = 'd125380f-6de1-4869-b10f-4162ec209f0e';
const app = { workspace: {}, vault: {} };
let audienceRows = [
  { uid: 'listOne', name: 'List One', post_notice_reserved: false },
  { uid: 'listTwo', name: 'List Two', post_notice_reserved: false }
];
const plugin = {
  settings: { sites: [] },
  loadPostNoticeAudiencesForSite: async () => audienceRows
};
const modal = new context.Modal(app, plugin, { basename: 'Title', path: 'Post.md' }, '',
  { title: 'Title', external_id: uid }, '');
modal.siteUid = uid;
modal.serverPost = { uid: postUid };
modal.listArea = { empty() {}, createEl() { return {}; } };

(async () => {
  await modal.refreshLists();
  toggles.get('List One').change(true);
  assert.equal(modal.selectedLists.size, 1);
  modal.selectedLists.get('listOne').subject = 'Custom subject';
  await modal.refreshLists();
  assert.equal(modal.selectedLists.get('listOne').subject, 'Custom subject');
  toggles.get('List Two').change(true);
  assert.equal(modal.selectedLists.size, 1);
  assert(!modal.selectedLists.has('listOne'));
  assert(modal.selectedLists.has('listTwo'));
  audienceRows = [
    { uid: 'listOne', name: 'List One', post_notice_reserved: true },
    { uid: 'listTwo', name: 'List Two', post_notice_reserved: false }
  ];
  await modal.refreshLists();
  assert.equal(modal.selectedLists.size, 1);
  assert(modal.selectedLists.has('listTwo'));
  audienceRows = [
    { uid: 'listOne', name: 'List One', post_notice_reserved: true },
    { uid: 'listTwo', name: 'List Two', post_notice_reserved: true }
  ];
  await modal.refreshLists();
  assert.equal(modal.selectedLists.size, 0);
  console.log('PASS: full Free content, 1-List selection/replacement, R3 cap and reserved-List re-authorization');
})().catch((error) => { console.error(error); process.exitCode = 1; });
