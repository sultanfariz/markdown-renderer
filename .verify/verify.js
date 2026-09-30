// Behavioral verification harness for the hash-routing fix in index.html.
// Mocks a minimal DOM/history/window (WHATWG-ish pushState semantics: fragment
// changes queue an async hashchange), then runs the REAL inline <script> from
// index.html in a fresh vm context per scenario.
//
// Scenarios: plain load, tab clicks (pushState + no double-fire), Back/Forward
// between tabs, shared URLs (?json= / ?json=#hash / ?md= / #hash / unknown hash).
'use strict';

const fs = require('fs');
const vm = require('vm');

const INDEX = process.env.INDEX_HTML || '/root/tribe/worktrees/tc-hunter-fix-pr13-hashrouting/index.html';
const html = fs.readFileSync(INDEX, 'utf8');
const scripts = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
// The main app script is the longest inline <script> block.
const inlineScript = scripts.sort((a, b) => b.length - a.length)[0].replace(/^<script>/, '').replace(/<\/script>$/, '');

// Compile first: catches any syntax error in the real script.
new vm.Script(inlineScript);

class MockClassList {
  constructor(initial = []) { this.set = new Set(initial); }
  add(...c) { c.forEach(x => this.set.add(x)); }
  remove(...c) { c.forEach(x => this.set.delete(x)); }
  contains(c) { return this.set.has(c); }
}

class MockElement {
  constructor(id, initialClasses = []) {
    this.id = id;
    this.classList = new MockClassList(initialClasses);
    this.style = {};
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.offsetWidth = 100;
    this.listeners = {};
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type, evt) { (this.listeners[type] || []).forEach(fn => fn(evt || {})); }
  focus() {}
}

function makeWorld(initialSearch = '', initialHash = '') {
  // --- DOM ---
  // Match real HTML initial state: tab-renderer active (text-primary/border-primary),
  // renderer-page visible, csv/json pages hidden.
  const elements = {
    'tab-renderer': new MockElement('tab-renderer', ['text-primary', 'border-primary']),
    'tab-csv': new MockElement('tab-csv'),
    'tab-json': new MockElement('tab-json'),
    'renderer-page': new MockElement('renderer-page'),
    'csv-page': new MockElement('csv-page'),
    'json-page': new MockElement('json-page'),
  };
  elements['renderer-page'].style.display = 'block';
  elements['csv-page'].style.display = 'none';
  elements['json-page'].style.display = 'none';

  const byId = new Map(Object.entries(elements));
  const document = {
    getElementById: id => {
      if (!byId.has(id)) byId.set(id, new MockElement(id)); // buttons, sidebar, etc.
      return byId.get(id);
    },
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => new MockElement('created'),
    createElementNS: () => new MockElement('created'),
    hasFocus: () => true,
    body: new MockElement('body'),
    documentElement: new MockElement('documentElement'),
  };

  // --- History / location (WHATWG-ish) ---
  let currentUrl = 'http://localhost/index.html' + initialSearch + initialHash;
  const historyEntries = [currentUrl]; // initial page load is the first entry
  let historyIndex = 0;
  const pendingTasks = [];

  const location = { href: currentUrl, hash: initialHash, search: initialSearch };
  const window = {
    location,
    _listeners: {},
    matchMedia: () => ({ matches: false }),
    focus: () => {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    dispatchEvent(evt) { (this._listeners[evt.type] || []).forEach(fn => fn(evt)); },
  };

  function syncLocation() {
    const u = new URL(currentUrl);
    location.href = currentUrl;
    location.hash = u.hash;
    location.search = u.search;
  }
  function queueHashchange(prev) {
    if (new URL(prev).hash !== new URL(currentUrl).hash) {
      pendingTasks.push(() => window.dispatchEvent({ type: 'hashchange' }));
    }
  }

  const history = {
    entries: historyEntries,
    pushState(_s, _t, url) {
      const prev = currentUrl;
      historyEntries.splice(historyIndex + 1);   // drop forward entries
      historyEntries.push(new URL(url, prev).href);
      historyIndex = historyEntries.length - 1;
      currentUrl = historyEntries[historyIndex];
      syncLocation();
      queueHashchange(prev);
    },
    replaceState(_s, _t, url) {
      const prev = currentUrl;
      currentUrl = new URL(url, prev).href;
      historyEntries[historyIndex] = currentUrl;
      syncLocation();
      queueHashchange(prev);
    },
    back() {
      if (historyIndex > 0) {
        const prev = currentUrl;
        historyIndex--;
        currentUrl = historyEntries[historyIndex];
        syncLocation();
        queueHashchange(prev);
      }
    },
    forward() {
      if (historyIndex < historyEntries.length - 1) {
        const prev = currentUrl;
        historyIndex++;
        currentUrl = historyEntries[historyIndex];
        syncLocation();
        queueHashchange(prev);
      }
    },
  };

  // --- Sandbox globals ---
  const sandbox = {
    window,
    document,
    history,
    location,
    URL,
    URLSearchParams,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    pako: { inflate: () => '{}' },   // valid JSON payload for ?json= / ?md=
    mermaid: { initialize: () => {}, run: () => {} },
    marked: { setOptions: () => {}, parse: () => '' },
    hljs: { highlight: () => ({ value: '' }) },
    DOMPurify: { sanitize: s => s },
    setTimeout: () => 0,             // suppress async render tasks
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(inlineScript, sandbox, { filename: 'index.html' });
  window.dispatchEvent({ type: 'load' });
  while (pendingTasks.length) pendingTasks.shift()();

  return {
    window, history, byId, pendingTasks,
    tabRenderer: elements['tab-renderer'],
    tabCsv: elements['tab-csv'],
    tabJson: elements['tab-json'],
    visible() {
      const r = elements['renderer-page'].style.display;
      const c = elements['csv-page'].style.display;
      const j = elements['json-page'].style.display;
      return r === 'block' ? 'renderer' : c === 'block' ? 'csv' : j === 'block' ? 'json' : 'none';
    },
    activeTab() {
      return ['tab-renderer', 'tab-csv', 'tab-json'].find(id => elements[id].classList.contains('text-primary'));
    },
    currentHash() { return new URL(location.href).hash; },
    flush() { while (pendingTasks.length) pendingTasks.shift()(); },
  };
}

let failures = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
}

// ============ Scenario 1: plain load, no params/hash ============
{
  const w = makeWorld('', '');
  check('S1: default tab is renderer', w.visible() === 'renderer' && w.activeTab() === 'tab-renderer', w.visible());
  check('S1: URL pinned to #markdown-renderer', w.currentHash() === '#markdown-renderer', w.currentHash());
  check('S1: no double-switch after load hashchange', w.visible() === 'renderer');
}

// ============ Scenario 2: clicks + back/forward between tabs ============
{
  const w = makeWorld('', '');
  w.tabCsv.dispatch('click'); w.flush();
  check('S2: click CSV switches to csv', w.visible() === 'csv', w.visible());
  check('S2: URL has #csv-to-markdown', w.currentHash() === '#csv-to-markdown', w.currentHash());

  w.tabJson.dispatch('click'); w.flush();
  check('S2: click JSON switches to json', w.visible() === 'json');
  check('S2: URL has #json-formatter', w.currentHash() === '#json-formatter', w.currentHash());
  check('S2: pushState created history entries', w.history.entries.length === 3, `len=${w.history.entries.length}`);
  check('S2: click did not double-switch (json still active)', w.activeTab() === 'tab-json');

  w.history.back(); w.flush();
  check('S2: Back -> csv tab', w.visible() === 'csv', w.visible());
  check('S2: Back restores #csv-to-markdown', w.currentHash() === '#csv-to-markdown', w.currentHash());

  w.history.back(); w.flush();
  check('S2: Back -> renderer tab', w.visible() === 'renderer');
  check('S2: Back restores #markdown-renderer', w.currentHash() === '#markdown-renderer', w.currentHash());

  w.history.forward(); w.flush();
  check('S2: Forward -> csv tab', w.visible() === 'csv');

  const before = w.history.entries.length;
  w.tabCsv.dispatch('click'); w.flush();
  check('S2: clicking active tab pushes no duplicate entry', w.history.entries.length === before, `len=${w.history.entries.length}`);
  check('S2: clicking active tab stays on tab', w.visible() === 'csv');
}

// ============ Scenario 3: shared URL ?json=... (no hash) ============
{
  const w = makeWorld('?json=SGVsbG8', '');
  check('S3: ?json= switches to JSON tab', w.visible() === 'json', w.visible());
  check('S3: ?json= pins #json-formatter hash', w.currentHash() === '#json-formatter', w.currentHash());
  check('S3: JSON payload loaded', w.byId.get('json-input').value === '{}');
}

// ============ Scenario 4: shared URL ?json=...#csv-to-markdown ============
{
  const w = makeWorld('?json=SGVsbG8', '#csv-to-markdown');
  check('S4: ?json=#csv lands on csv tab (UI == URL)', w.visible() === 'csv', w.visible());
  check('S4: URL stays #csv-to-markdown', w.currentHash() === '#csv-to-markdown', w.currentHash());
  check('S4: JSON payload still loaded (hidden tab)', w.byId.get('json-input').value === '{}');
}

// ============ Scenario 5: shared URL ?json=...#json-formatter ============
{
  const w = makeWorld('?json=SGVsbG8', '#json-formatter');
  check('S5: ?json=#json-formatter stays on JSON tab', w.visible() === 'json', w.visible());
  check('S5: URL unchanged', w.currentHash() === '#json-formatter', w.currentHash());
}

// ============ Scenario 6: shared URL ?md=... (no hash) ============
{
  const w = makeWorld('?md=SGVsbG8', '');
  check('S6: ?md= keeps renderer tab', w.visible() === 'renderer');
  check('S6: ?md= pins #markdown-renderer', w.currentHash() === '#markdown-renderer', w.currentHash());
  check('S6: markdown payload loaded', w.byId.get('markdown-input').value === '{}');
}

// ============ Scenario 7: direct hash load ============
{
  const w = makeWorld('', '#json-formatter');
  check('S7: #json-formatter switches to json', w.visible() === 'json');
  check('S7: URL stays #json-formatter', w.currentHash() === '#json-formatter', w.currentHash());
}
{
  const w = makeWorld('', '#csv-to-markdown');
  check('S7b: #csv-to-markdown switches to csv', w.visible() === 'csv');
  check('S7b: URL stays #csv-to-markdown', w.currentHash() === '#csv-to-markdown', w.currentHash());
}

// ============ Scenario 8: unknown hash defaults to active tab's hash ============
{
  const w = makeWorld('', '#garbage');
  check('S8: unknown hash -> renderer tab', w.visible() === 'renderer', w.visible());
  check('S8: URL fixed to #markdown-renderer', w.currentHash() === '#markdown-renderer', w.currentHash());
}
{
  const w = makeWorld('?json=SGVsbG8', '#garbage');
  check('S8b: ?json= + unknown hash -> JSON tab', w.visible() === 'json', w.visible());
  check('S8b: URL fixed to #json-formatter', w.currentHash() === '#json-formatter', w.currentHash());
}

// ============ Scenario 9: live hashchange (manual URL edit) ============
{
  const w = makeWorld('', '');
  w.history.replaceState(null, null, '#csv-to-markdown'); w.flush();
  check('S9: manual hash edit -> csv tab', w.visible() === 'csv', w.visible());
  w.history.replaceState(null, null, '#'); w.flush();
  check('S9: clearing hash -> default renderer', w.visible() === 'renderer', w.visible());
}

// ============ Scenario 10: click JSON -> back -> click CSV (mixed history) ============
{
  const w = makeWorld('', '');
  w.tabCsv.dispatch('click'); w.flush();
  w.tabJson.dispatch('click'); w.flush();
  check('S10: csv -> json', w.visible() === 'json');
  w.history.back(); w.flush();
  check('S10: back -> csv', w.visible() === 'csv', w.visible());
  w.tabRenderer.dispatch('click'); w.flush();
  check('S10: click renderer', w.visible() === 'renderer');
  w.history.back(); w.flush();
  check('S10: back -> csv (history intact)', w.visible() === 'csv', w.visible());
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
