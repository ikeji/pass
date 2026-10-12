# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A static, client-side deterministic password generator ("scrypt test") served via GitHub Pages at `pass.ikeji.ma` (see `CNAME`). There is no build step, package manager, linter, or test suite — all dependencies are vendored as minified files in the repo root (original archives in `dist/`).

- Active development happens on the `gh-pages` branch (which is what gets deployed). `master` is older and behind.
- To run locally, serve the directory over HTTP (e.g. `python3 -m http.server`) and open `index.html`. Plain `file://` won't work because the app `fetch`es `public_suffix_list.dat`.

## Architecture

All application code lives inline in `index.html` inside `<script type="text/jsise">`. **It is written in jsise, a Lisp dialect**, not JavaScript. `jsise.js` (loaded last) finds `text/jsise` scripts and compiles/evaluates them in the browser. Key jsise idioms used here:

- `define-macro` / `defmacro` with `syntax-template` (`~0`, `~1-` for positional/rest args) or `quasiquote`/`unquote`.
- `(. obj method args)` calls a method; `(. obj -prop value)` sets a property; `(set! a.b v)` assigns.
- `(// comment)` is a comment form.
- Custom macros defined at the top of the script: `react-html` (S-expression → `React.createElement`; lowercase tag names become DOM elements, `(, expr)` splices raw expressions), `define-react-template` (stateless function component taking `prop`), `define-react-component` (`React.createClass`), and `define-mdl-component` (component that calls `componentHandler.upgradeElements` on mount for Material Design Lite).

The app follows a simple global model/render pattern (React 15 + MDL):

- A single mutable `model` object (`history`, `input`, `output`). Controller functions mutate `model` and then call `render()`, which re-renders `Main` from scratch with `ReactDOM.render`.
- Password generation: concatenates `masterPassword|siteName|userid|comment`, runs `scrypt` (N=2^19, r=8, p=1, dkLen=32), base64-encodes, strips non-alphanumerics, and takes the first 8 chars. Changing any of these parameters or the input format changes every generated password (see the "[Incompatible]" commit in history) — treat as a breaking change.
- A quick "sample" check (scrypt with N=2^10, first 3 chars) is shown in green beside the master password field so the user can confirm they typed it correctly.
- Master password and generated password are auto-cleared after `TIMEOUT_MS` (5 min) via a polling `clearPasswords` loop.
- History (siteName/userid/comment, never passwords) is persisted in `localStorage["histories"]`.
- Bookmarklet opens the app with `?url=...`; `getServiceName` uses publicsuffixlist.js + punycode to derive the registrable domain and prefill site name / matching history entry.

Some identifiers contain longstanding typos (`appendHisotry`, `applyHisotry`, `lastUpdateMasterPasword`, `passwordGeneatedAt`); keep them consistent rather than partially renaming.
