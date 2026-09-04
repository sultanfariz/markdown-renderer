## Summary

Fixes the 4 review feedback items on [PR #13](https://github.com/sultanfariz/markdown-renderer/pull/13) (hash-based URL routing). Single file changed: `index.html`.

## Review feedback addressed

1. **`replaceState` doesn't create history entries — Back exits the site** ([comment](https://github.com/sultanfariz/markdown-renderer/pull/13#discussion_r3793908843))
   Tab clicks now use `history.pushState` instead of `replaceState`, so each tab switch creates a history entry and the Back button navigates between tabs instead of leaving the page. (Only initial-load hash pinning still uses `replaceState`, so no spurious history entry is added on load.)

2. **Click handlers + `hashchange` can double-fire tab switch** ([comment](https://github.com/sultanfariz/markdown-renderer/pull/13#discussion_r3793909161))
   `switchTabWithHash` now tracks the active tab and skips the switch when the requested tab is already active — the async `hashchange` queued by `pushState`/`replaceState` after a click is a no-op, and clicking an already-active tab pushes no duplicate history entry.

3. **Hash routing runs before URL-param handlers — URL and tab diverge** ([comment](https://github.com/sultanfariz/markdown-renderer/pull/13#discussion_r3793909393))
   Hash routing now runs *after* `loadFromURL`/`loadJSONFromURL` in the load handler:
   - `/?json=...` stays on the JSON tab and pins `#json-formatter`
   - `/?json=...#csv-to-markdown` shows the CSV tab under the `#csv-to-markdown` URL (UI always matches the URL hash)
   - Missing/unknown hashes pin the URL to the tab that's currently active (via `replaceState`)

4. **Duplicated hash strings — two sources of truth** ([comment](https://github.com/sultanfariz/markdown-renderer/pull/13#discussion_r3793909594))
   Tab click handlers are now derived from the `tabHashMapping` entries (hash without `#` + tab + switch function), so the hash strings exist in exactly one place.

## Verification

The fixed code was exercised with a DOM/history mock harness (WHATWG `pushState` semantics: fragment changes queue an async `hashchange`):

- **Fixed code: 41/41 checks pass** — tab switching, Back/Forward between tabs, shared-URL loads (`?json=`, `?json=#hash`, `?md=`, bare `#hash`, unknown hash), no double-fire, no duplicate history entries.
- **Original PR #13 code: 13 checks fail** — exactly the reviewed behaviors: no history entries (Back does nothing), `?json=...` landing on the renderer tab under `#markdown-renderer`, JSON tab under `#csv-to-markdown` URL.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
