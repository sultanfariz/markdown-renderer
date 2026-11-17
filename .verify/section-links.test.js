'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld } = require('./verify');

test('headings receive unique IDs and a section fragment scrolls after rendering and on navigation', async () => {
  const w = makeWorld('', '#browser-worker');
  const headings = ['Browser Worker', 'Browser Worker', 'Hello, World!'].map(textContent => ({
    textContent, id: '', scrollIntoView() { this.scrolled = true; }
  }));
  const output = w.byId.get('rendered-content');
  output.querySelectorAll = selector => selector === '.mermaid' ? [] : headings;
  w.sandbox.document.querySelectorAll = () => headings;
  w.sandbox.marked.Renderer = function () {};
  w.sandbox.setTimeout = callback => { callback(); };
  w.byId.get('markdown-input').value = 'markdown';
  await w.sandbox.renderMarkdown();
  assert.deepEqual(headings.map(h => h.id), ['browser-worker', 'browser-worker-1', 'hello-world']);
  assert.equal(headings[0].scrolled, true);
  w.tabCsv.dispatch('click');
  w.history.replaceState(null, null, '#browser-worker-1');
  w.window.dispatchEvent({ type: 'hashchange' });
  assert.equal(w.visible(), 'renderer');
  assert.equal(headings[1].scrolled, true);
});
