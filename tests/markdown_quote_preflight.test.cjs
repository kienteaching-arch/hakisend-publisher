'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');

const source = readFileSync('src/runtime/publisher-bundle.cjs', 'utf8');
const built = readFileSync('main.js', 'utf8');
const start = source.indexOf('// HAKISEND_MARKDOWN_QUOTE_PREFLIGHT_BEGIN');
const end = source.indexOf('// HAKISEND_MARKDOWN_QUOTE_PREFLIGHT_END');
assert.ok(start >= 0 && end > start, 'guard must exist in runtime source');
const extracted = source.slice(start, end);
const { detect, assertClean } = runInNewContext(
  extracted + '\n({detect:detectMalformedArticleQuoteNesting, assertClean:assertNoMalformedArticleQuoteNesting})',
  {}
);

const article = (prefix) => [
  '# Article heading',
  ...Array.from({ length: 20 }, (_, i) =>
    i % 5 === 0 ? prefix + ' ## Section ' + i : prefix + ' Paragraph number ' + i)
].join('\n');

test('production source and built main.js must remain byte-identical', () => {
  assert.equal(source, built);
});

test('guard is called before image upload and posts/upsert', () => {
  const save = source.slice(source.indexOf('async saveCurrentNoteCore('));
  const guardPosition = save.indexOf('assertNoMalformedArticleQuoteNesting(body);');
  const mediaPosition = save.indexOf('this.rewriteLocalImages(');
  const upsertPosition = save.indexOf('/posts/upsert');
  assert.ok(guardPosition >= 0 && guardPosition < mediaPosition && mediaPosition < upsertPosition);
});

test('stops article-wide 3-layer markdown quote prefix before any remote write', () => {
  assert.ok(detect(article('>>>')));
  assert.throws(() => assertClean(article('>>>')), /stopped this post before saving/);
});

test('stops article-wide 2-layer quote prefix with multiple headings', () => {
  assert.ok(detect(article('>>')));
});

test('stops short multi-line 3-layer wrappers when almost entire note is quoted', () => {
  const markdown = Array.from({ length: 8 }, (_, i) => '>>> paragraph ' + i).join('\n');
  assert.ok(detect(markdown));
});

test('does not block normal notes or a short intentional nested quotation', () => {
  assert.equal(detect('## Section\nNormal paragraph.\n> Intentional quotation.'), null);
  assert.equal(detect('>> A\n>> B\n>> C'), null);
  assert.doesNotThrow(() => assertClean('## Section\n> Intentional quotation.'));
});

test('ignores code fences containing literal markdown symbols', () => {
  const code = ['~~~markdown', ...Array.from({length: 25}, () => '>>>> ## Literal'), '~~~'].join('\n');
  assert.equal(detect(code), null);
  const jsCode = ['```markdown', ...Array.from({length: 25}, () => '>>>> ## Literal'), '```'].join('\n');
  assert.equal(detect(jsCode), null);
});

test('does not block long single-level quotations', () => {
  assert.equal(detect(Array.from({length: 50}, () => '> Genuine quotation').join('\n')), null);
});
