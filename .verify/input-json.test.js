'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { makeWorld } = require('./verify');

function storage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('all three drafts survive reload, including empty and invalid input', () => {
  const saved = storage();
  const world = makeWorld('', '', saved);
  const drafts = { 'markdown-input': '# draft', 'csv-input': '', 'json-input': '{unfinished' };
  for (const [id, value] of Object.entries(drafts)) {
    const input = world.byId.get(id);
    input.value = value;
    input.dispatch('input');
  }
  const reloaded = makeWorld('', '', saved);
  for (const [id, value] of Object.entries(drafts)) assert.equal(reloaded.byId.get(id).value, value);
});

test('shared JSON overrides a saved draft and updates byte size', () => {
  const saved = storage();
  const world = makeWorld('', '', saved);
  world.byId.get('json-input').value = '{draft';
  world.byId.get('json-input').dispatch('input');
  const shared = makeWorld('?json=SGVsbG8', '', saved);
  assert.equal(shared.byId.get('json-input').value, '{}');
  assert.equal(shared.byId.get('json-byte-size').textContent, '0.00 KB');
  assert.equal(makeWorld('', '', saved).byId.get('json-input').value, '{}');
});

test('sample, minify and clear persist their programmatic changes', () => {
  const saved = storage();
  const world = makeWorld('', '', saved);
  world.byId.get('json-sample-btn').dispatch('click');
  const sample = world.byId.get('json-input').value;
  assert.equal(makeWorld('', '', saved).byId.get('json-input').value, sample);
  world.byId.get('json-minify-btn').dispatch('click');
  assert.equal(makeWorld('', '', saved).byId.get('json-input').value, world.byId.get('json-input').value);
  for (const [inputId, clearId] of [['markdown-input', 'clear-btn'], ['csv-input', 'clear-csv-btn'], ['json-input', 'json-clear-btn']]) {
    world.byId.get(inputId).value = 'draft';
    world.byId.get(inputId).dispatch('input');
    world.byId.get(clearId).dispatch('click');
    assert.equal(makeWorld('', '', saved).byId.get(inputId).value, '');
  }
  assert.equal(world.byId.get('json-byte-size').textContent, '0.00 KB');
});

test('input size shows decimal KB using UTF-8, including whitespace and malformed JSON', () => {
  const world = makeWorld();
  for (const value of ['', 'a', ' "é😀" ', '{invalid', 'a'.repeat(1000), 'a'.repeat(1024), 'é'.repeat(500)]) {
    world.byId.get('json-input').value = value;
    world.byId.get('json-input').dispatch('input');
    const bytes = Buffer.byteLength(value, 'utf8');
    assert.equal(world.byId.get('json-byte-size').textContent, `${(bytes / 1000).toFixed(2)} KB`);
  }
});

test('draft storage read/write failures do not break editing', () => {
  const saved = storage();
  // Existing preferences still work; only draft storage is unavailable.
  const blocked = {
    getItem(key) { if (key.startsWith('draft:')) throw Error('denied'); return saved.getItem(key); },
    setItem(key, value) { if (key.startsWith('draft:')) throw Error('quota'); saved.setItem(key, value); },
  };
  const world = makeWorld('', '', blocked);
  world.byId.get('json-input').value = 'é';
  assert.doesNotThrow(() => world.byId.get('json-input').dispatch('input'));
  assert.equal(world.byId.get('json-byte-size').textContent, '0.00 KB');
});

test('collapsed JSON summaries include matching object and array closers', () => {
  const world = makeWorld();
  for (const [json, summary] of [['{"a":1,"b":2}', '2 keys'], ['[1,2,3]', '3 items']]) {
    world.byId.get('json-input').value = json;
    world.byId.get('json-format-btn').dispatch('click');
    const html = world.byId.get('json-tree-output').innerHTML;
    const close = json.startsWith('[') ? ']' : '}';
    assert.ok(html.includes(`${summary} <span class="json-punct">${close}</span></span>`), html);
  }
  assert.equal(vm.runInContext('jsoncParse("[1,2]").value.length', world.sandbox), 2);
});

test('bulk collapse keeps the root open and hides each nested closer consistently', () => {
  const world = makeWorld();
  function node() {
    const children = ['json-children', 'json-closer', 'json-summary'].map(name => ({
      classList: { contains: value => value === name }, style: {},
    }));
    return { parentElement: { children }, innerHTML: '', attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; } };
  }
  const root = node();
  const nested = node();
  world.sandbox.document.querySelectorAll = selector => {
    if (selector.endsWith('.json-toggle')) return [root, nested];
    const name = selector.split('.').pop();
    // Closers occur in postorder, unlike opening rows.
    const nodes = name === 'json-closer' ? [nested, root] : [root, nested];
    return nodes.map(btn => btn.parentElement.children.find(c => c.classList.contains(name)));
  };
  world.byId.get('json-collapse-btn').dispatch('click');
  assert.equal(root.parentElement.children[1].style.display, 'block');
  assert.equal(nested.parentElement.children[1].style.display, 'none');
  assert.equal(nested.attributes['aria-expanded'], 'false');
  world.byId.get('json-expand-btn').dispatch('click');
  for (const btn of [root, nested]) {
    assert.equal(btn.parentElement.children[1].style.display, 'block');
    assert.equal(btn.parentElement.children[2].style.display, 'none');
    assert.equal(btn.attributes['aria-expanded'], 'true');
  }
});
