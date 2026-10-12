// Loads index.html in jsdom with the vendored scripts, the same way a browser would.
const path = require("node:path");
const fs = require("node:fs");
const { JSDOM, ResourceLoader, VirtualConsole } = require("jsdom");

const ROOT = path.resolve(__dirname, "..", "..");
// Pages are served from this fake origin, mapped to files under ROOT.
// (localStorage is unavailable on file: URLs.)
const ORIGIN = "https://app.test/";

function localPath(url) {
  if (!url.startsWith(ORIGIN)) return null;
  const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, "");
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return null;
  return file;
}

// Only local files may be loaded; anything else would mean the page loads code from the network.
class LocalOnlyLoader extends ResourceLoader {
  constructor(blocked) {
    super();
    this.blocked = blocked;
  }
  fetch(url) {
    const file = localPath(url);
    if (!file) {
      this.blocked.push(url);
      return null;
    }
    return Promise.resolve(fs.readFileSync(file));
  }
}

async function openApp({ html = "index.html", query = "", storage = {} } = {}) {
  const blocked = [];
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => errors.push(e));
  virtualConsole.on("error", (...a) => errors.push(a.join(" ")));
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, html)), {
    url: ORIGIN + html + query,
    runScripts: "dangerously",
    resources: new LocalOnlyLoader(blocked),
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
      // jsdom lacks these. Its postMessage also never satisfies the setImmediate.js polyfill,
      // so provide a native setImmediate (the polyfill steps aside when one exists).
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
      window.setImmediate = (fn, ...args) => setImmediate(() => fn(...args));
      window.TextEncoder = TextEncoder;
      // jsdom has no fetch; serve local files only.
      window.fetch = async (u) => {
        const file = localPath(new URL(u, window.location.href).href);
        if (!file) throw new Error("network fetch blocked: " + u);
        const text = fs.readFileSync(file, "utf8");
        return { ok: true, text: async () => text, json: async () => JSON.parse(text) };
      };
      window.navigator.clipboard = {
        written: [],
        writeText: async (t) => { window.navigator.clipboard.written.push(t); },
      };
    },
  });
  await new Promise((resolve) => dom.window.addEventListener("load", resolve));
  return { dom, window: dom.window, document: dom.window.document, blocked, errors };
}

async function waitFor(fn, { timeout = 30000, interval = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, interval));
  }
}

module.exports = { ROOT, ORIGIN, openApp, waitFor };
