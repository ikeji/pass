# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A static, client-side deterministic password generator ("scrypt test") served via GitHub Pages at `pass.ikeji.ma` (see `CNAME`). There is no build step: all runtime dependencies are vendored as files in the repo root (npm tarballs / source archives kept in `dist/`). The page must never load scripts, styles or fonts from the network.

- Active development happens on the `gh-pages` branch (which is what gets deployed). `master` is older and behind.
- To run locally, serve the directory over HTTP (e.g. `python3 -m http.server`) and open `index.html`. Plain `file://` won't work because the app `fetch`es `public_suffix_list.dat` and needs `localStorage`.

## Tests

Integration tests live in `test/` (Node + jsdom; dev-only, nothing there is served):

```sh
cd test && npm install
npm test                                   # all tests (~1-2 min; scrypt N=2^19 runs for real)
node --test --test-name-pattern="presets" app.test.js   # a single test
node lib/compile-jsise.js > /tmp/out.js    # dump the JavaScript jsise generates (for debugging)
```

- `golden.json` holds passwords recorded from the original app (`record-golden-legacy.js`), and `golden.test.js` checks them against Node's own `crypto.scryptSync`. `golden-rules.json` freezes the outputs of the rule-based generator. **These must never be re-recorded to make a change pass**: a diff there means users' existing passwords changed.
- `test/lib/browser.js` serves the repo from a fake `https://app.test/` origin, blocks every other URL (tests assert nothing was blocked), and shims what jsdom lacks (`setImmediate`, `matchMedia`, `fetch`, clipboard).

## Architecture

All application code lives inline in `index.html` inside `<script type="text/jsise">`. **It is written in jsise, the author's Lisp dialect**, not JavaScript (compiler source: `~/work/lang/js/jsise`). `jsise.js` (loaded last) compiles and `eval`s `text/jsise` scripts in the browser; it only reads inline scripts, and macros don't carry over between script blocks. Idioms and pitfalls:

- `(. obj method args)` calls a method; `(. obj -prop)` gets / `(. obj -prop value)` sets a property; `(set! a.b v)` assigns. `(// comment)` is a comment form.
- `fn` takes a single expression; use `function` when the body has statements (`when`, `ifs`, `var`, `return`, `for`, `while`, `try`). `cond`/`if` are expressions, `when`/`ifs` are statements.
- The vendored stdlib has no `!==` or `>=` (`=>` emits `=>`), and `-`/`*` are binary only. Use `(not (=== a b))` and `(<= b a)`.
- `define-function` is `var f = function f…`, so it is not hoisted: the entry point at the bottom must come after everything it calls.
- `react-html` turns S-expressions into `React.createElement`: lowercase tag names become DOM elements, attributes are the second list, and any JavaScript expression used as a child must be wrapped as `(, expr)` (e.g. `(, + i 1)`); bare strings and symbols pass through. `define-react-template` defines a function component taking `prop`.

The app uses a global model/render pattern (React 18 via `ReactDOM.createRoot`, plain function components, no hooks):

- A single mutable `model` (`step`, `presets`, `filter`, `focus`, `input`, `output`). Controller functions mutate it and call `render()`. `window.scrypttest` exposes internals for the tests.
- Wizard steps: `select` (choose/search presets, or New) → `params` (master password, site name, user id, comment, password rule, note) → `result` (progress, masked password, check emoji, phonetic spelling, copy). A separate `settings` page (header button) has preset import/export and the bookmarklet.
- Password generation: scrypt of `masterPassword|siteName|userid|comment` (NFC-normalized UTF-8, password = salt, N=2^19, r=8, p=1, dkLen=32+1024). The original password is the alphanumerics of base64 of the first 32 bytes, cut to 8 chars. Users pick a password rule from the fixed `RULE_OPTIONS` (stored by id in presets; ids and their rules must never change once released, only new ones may be added, and `golden-rules.json` must cover every id). `passwordFromKey` keeps that string (cut to the rule length) whenever it satisfies the rule, so `alnum8` always reproduces the original passwords; otherwise `sampledPassword` draws characters from the remaining key bytes. The note and the rule are not part of the scrypt input.
- Check emoji: scrypt with N=2^10 of the master password (and of the generated password), mapped to 1 of 64 emoji. Deliberately only 6 bits: it is for spotting typos, and more bits would help someone who sees it guess the secret.
- Master and generated passwords (and the phonetic spelling, which keeps its space while hidden) show only while their field is focused, and are cleared 5 minutes after the last change/generation (`clearExpiredSecrets` polling loop).
- Presets (site name, user id, comment, note, rule id; keyed by site name+user id+comment) are stored in `localStorage["presets"]` in the same JSON format as the export file. The old `localStorage["histories"]` is migrated once and left in place.
- The bookmarklet opens the app with `?url=...`; `startFromUrl` uses publicsuffixlist.js + punycode to derive the registrable domain and picks the matching preset.

Vendored library notes: React 18.3.1 is the last release with UMD builds. scrypt-js 3 falls back to `setTimeout` (≈4ms clamp per step, very slow) without `setImmediate`, so keep `setImmediate.js`. publicsuffixlist.js stays on the old global-script version (3.x is an ES module only, and jsdom can't run module scripts). `var module = {}` before `punycode.js` absorbs its CommonJS export; `punycode` is a top-level `const`.
