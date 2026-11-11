const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('New website post collects and submits a trimmed Excerpt', async () => {
  const start = source.indexOf('var HakiSendNewPostModal = class');
  const end = source.indexOf('// Read-only Post Calendar v1.', start);
  assert(start >= 0 && end > start);

  const settings = [];
  class Setting {
    constructor() {
      settings.push(this);
      this.controlEl = { empty() {} };
    }
    setName(name) { this.name = name; return this; }
    setDesc() { return this; }
    addButton(cb) {
      cb({ setButtonText() { return this; }, setCta() { return this; }, onClick() { return this; } });
      return this;
    }
    addText(cb) {
      const input = {
        setPlaceholder() { return this; },
        onChange(fn) { this.inputChange = fn; return this; },
        inputEl: { addEventListener() {}, focus() {} }
      };
      cb(input);
      this.inputChange = input.inputChange;
      return this;
    }
    addTextArea(cb) {
      const input = {
        setPlaceholder() { return this; },
        onChange(fn) { this.inputChange = fn; return this; }
      };
      cb(input);
      this.inputChange = input.inputChange;
      return this;
    }
  }

  const sandbox = {
    import_obsidian: {
      Modal: class { constructor(app) { this.app = app; this.contentEl = { empty() {}, createEl() {} }; } close() {} },
      Setting,
      Notice: class { constructor(msg) { throw Error(msg); } }
    },
    normalizeFolderPath: (v) => v,
    window: { setTimeout() {} }
  };
  vm.runInNewContext(source.slice(start, end), sandbox);
  let payload;
  const modal = new sandbox.HakiSendNewPostModal({}, '', async () => {}, async (values) => { payload = values; });
  modal.onOpen();
  const title = settings.find((setting) => setting.name === 'Title');
  const excerpt = settings.find((setting) => setting.name === 'Excerpt');
  assert(title);
  assert(excerpt, 'New Post must expose an Excerpt field');
  title.inputChange('My website post');
  excerpt.inputChange('  A concise summary for the website.  ');
  modal.destination = {
    siteUid: 'site-1', folderPath: 'KIEN OS/Business',
    categories: [{ uid: 'category-1', slug: 'business' }]
  };
  modal.categoryUid = 'category-1';
  await modal.submit();
  assert.equal(payload.excerpt, 'A concise summary for the website.');
  assert.equal(payload.title, 'My website post');
  assert.equal(payload.siteUid, 'site-1');
});

test('new local Website draft persists Excerpt as an editable Obsidian property', async () => {
  const method = source.slice(source.indexOf('  async createNewPost(values) {'), source.indexOf('  async ensureExternalId(', source.indexOf('  async createNewPost(values) {')));
  assert(method.startsWith('  async createNewPost(values) {'));
  let created;
  const sandbox = {
    yamlQuotedScalar: JSON.stringify,
    uuidV4: () => 'example-external-uuid',
    import_obsidian: { Notice: class { constructor() {} } }
  };
  const { createNewPost } = vm.runInNewContext(`({${method}})`, sandbox);
  const context = {
    resolveNewPostDestination: async () => ({ siteUid: 'site-1', categories: [{ uid: 'cat-1', slug: 'parenting' }] }),
    uniqueNewPostPath: () => 'KIEN OS/new post.md',
    app: {
      vault: { create: async (filePath, content) => { created = { filePath, content }; return { path: filePath }; } },
      workspace: { getLeaf: () => ({ openFile: async () => {} }) }
    }
  };
  const values = {
    folderPath: 'KIEN OS', siteUid: 'site-1', title: 'My post',
    excerpt: 'Summary of my post', category: { uid: 'cat-1' }
  };
  await createNewPost.call(context, values);
  assert.equal(created.filePath, 'KIEN OS/new post.md');
  assert.match(created.content, /^excerpt: "Summary of my post"$/m);
  assert.match(created.content, /^status: draft$/m);
  await createNewPost.call(context, { ...values, excerpt: '' });
  assert.match(created.content, /^excerpt: ""$/m);
});
