## Summary

JSON **Share** now behaves like Markdown **Share**: the content is deflated + base64url-encoded into a `?json=` URL, at any size. The anonymous-Gist upload tier — which can never work from a static Pages site — is gone, and the silent "copy the raw JSON instead" fallback is gone with it.

One functional file changed: `index.html` (plus a one-line README note).

## Root cause (confirmed in code)

`shareJSON()` (from #11) used a two-tier strategy:

| tier | condition | behaviour |
| --- | --- | --- |
| 1 | raw JSON ≤ 25,000 bytes **and** compressed ≤ 6,000 bytes | deflate + base64url → `?json=` URL (works) |
| 2 | anything larger | `POST https://api.github.com/gists`, unauthenticated |

A static GitHub Pages site has no token, so the POST always returns **401**; the `catch` block then copied the **raw, uncompressed JSON** to the clipboard labelled *"Copied raw JSON"* — no toast, no alert, and the button resets after 3 s, so the user believes a link was shared. That is exactly the reported failure: nothing useful happens from ~25 KB upward, for both pretty and minified input.

The pre-fix baseline below reproduces it mechanically: for a 122,908-byte input the harness records a network attempt to `api.github.com/gists` and the clipboard ends up holding **the raw JSON itself**, not a URL.

## Fix

- **One path, the markdown one**: `pako.deflate(input, { level: 9 })` → existing `bytesToBase64url()` helper → `?json=<payload>`. No second scheme, no size tiers.
- **Gist upload removed entirely** — no `fetch`, no `api.github.com`, no `gist` references left in the file.
- **Raw JSON is never copied on failure.** The single remaining guard is a URL-length ceiling (`MAX_SHARE_URL_LENGTH = 2_000_000` chars; Chrome caps URLs near 2 MB): past it the share fails **loudly** — red button state + alert naming the size — and the clipboard is left untouched.
- **Visible feedback in both directions**: success `Link copied! (N% smaller)` (markdown's is `Copied! (N% smaller)`); failure `error_outline` + red state + alert. The clipboard-denied path still offers the URL through the existing `prompt` fallback.
- **Restore path untouched** (`?json=` → JSON tab, content restored, auto-format). JSONC comments and trailing commas still round-trip byte-for-byte.

## Decision: view mode is *not* carried in the shared URL

`runFormatJSON()` sets the tree view on every format and the restore path runs it, so a shared link always opens in Tree. Propagating the sharer's Formatted/Tree choice would mean threading a `view=` parameter through the deferred format call *and* deciding whether it overrides the recipient's persisted `jsonViewMode` preference — i.e. editing the view-persistence logic added by #17, for an optional feature. Markdown share carries no view state either (`?md=` only), so this was left out to keep parity and a tight diff.

## Verification

Temporary workflow on this branch (deleted from the branch before the PR): **[run 37028282412](https://github.com/sultanfariz/markdown-renderer/actions/runs/37028282412)** — vm harness **49/49 pass**, browser e2e **16/16 pass** on the fixed file; pre-fix baseline **21 checks fail**, reproducing the reported bug.

**A. VM harness** — the real inline `<script>` executed in a mocked DOM, `pako` shimmed with node's zlib (same stream format), `fetch` a tripwire:

- small JSONC → clipboard = `?json=` URL, decodes byte-identically; recipient load: JSON tab active, input restored, tree rendered, comments preserved
- 120 KB → 122,908-char input becomes a 26,118-char URL, exact round-trip + restore
- ~1 MB incompressible → 1,024,011-char input becomes a 1,028,464-char URL, exact round-trip + restore
- ~4 MB incompressible → guard trips: **nothing** copied, alert names the size, red button state, no prompt
- clipboard denied → `prompt` offers the URL; raw JSON never copied
- markdown share small + 1 MB → unchanged, `?md=` URLs round-trip (1 MB → 1,028,462-char URL)
- zero `fetch` calls on any share path; no uncaught async errors

**B. Browser e2e (chromium, CDN `pako`, real navigation)** — 16/16 checks: small URL copied → opened → restored + rendered; 1 MB incompressible → 1,034,282-char `?json=` URL → opened → restored + rendered; 4 MB → nothing copied + loud alert; **zero requests to `api.github.com`**; no Gist console errors; markdown share still works.

**C. Pre-fix baseline** (same harness pointed at `1044093:index.html` = current `main`) → 21 checks fail, precisely where reported:
```
FAIL  120KB: no network request during share  -- ["https://api.github.com/gists"]
FAIL  120KB: clipboard holds a ?json= share URL
FAIL  120KB: URL decodes to the exact input (input 122908 chars -> URL 122908 chars)   # raw JSON, not a URL
FAIL  1MB incompressible: clipboard holds a ?json= share URL
FAIL  absurd: nothing written to the clipboard (no raw-JSON fallback)  -- wrote 1 time(s)
FAIL  absurd: button shows an error state  -- <span>Copied raw JSON</span>
```

## Notes

- Server-side limits on very long request lines are outside the app's control; the client-side 2 MB guard is the app-level bound (and is well above the 1 MB case).
- Not touched: Markdown/CSV tabs, hash routing, view persistence.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
