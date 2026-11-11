const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bundle = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const first = bundle.indexOf('var HakiSendManualPromotionModal = class extends import_obsidian.Modal {');
const last = bundle.indexOf('var HakiSendEmailDeliveryReadinessModal =', first);
assert(first >= 0 && last > first, 'Promotion modal source missing');

const buttons = {};
const controls = [];
const rendered = [];
class Setting {
  setName() { return this; }
  setDesc() { return this; }
  addText(fn) {
    fn({setValue() {return this;}, setDisabled() {return this;}});
    return this;
  }
  addToggle(fn) {
    const control = {
      setValue() {return this;},
      onChange(cb) {this.change = cb; return this;}
    };
    controls.push(control);
    fn(control);
    return this;
  }
  addButton(fn) {
    const button = {
      setButtonText(text) {this.label = text; buttons[text] = this; return this;},
      setCta() {return this;},
      setDisabled(disabled) {this.disabled = disabled; return this;},
      onClick(cb) {this.click = cb; return this;}
    };
    fn(button);
    return this;
  }
}

const ctx = {
  import_obsidian: {
    Modal: class { constructor(app) {this.app = app;} },
    Setting,
    Notice: class { constructor(text) {this.text = text;} }
  }
};
vm.createContext(ctx);
vm.runInContext(bundle.slice(first, last) + '\nthis.Promotion = HakiSendManualPromotionModal;', ctx);

const root = {
  empty() {},
  createEl(tag, attrs) {
    const node = {tag, text: attrs?.text || '', setText(text) {this.text = text;}};
    rendered.push(node);
    return node;
  }
};
let tries = 0;
const modal = new ctx.Promotion({}, {subject: 'Test subject'}, {
  from_email: 'hello@example.com', from_name: 'Author',
  reply_to: 'hello@example.com', list_name: 'TEST ONLY'
}, async () => {
  tries++;
  throw new Error('Remote Private Draft changed: review it before promotion. Nothing created.');
});
modal.renderInto(root);
controls[0].change(true);

(async () => {
  await buttons['Chuẩn bị email'].click();
  assert.equal(tries, 1, 'One attempt only');
  assert.equal(buttons['Chuẩn bị email'].disabled, true, 'Ambiguous operation must stay disabled');
  assert.equal(modal.requiresReconciliation, true);
  assert(rendered.some((r) => r.text.includes('KHÔNG XÁC NHẬN ĐƯỢC BƯỚC 2:')));
  assert(rendered.some((r) => r.text.includes('Remote Private Draft changed')));
  await buttons['Chuẩn bị email'].click();
  assert.equal(tries, 1, 'Repeated click must not send a second promotion');
  console.log('PASS: persistent Step 2 error, explicit reason and no same-window retry');
})().catch((error) => { console.error(error); process.exitCode = 1; });
