// Helpers for driving the wizard in jsdom.
const crypto = require("node:crypto");
const { openApp, waitFor } = require("./browser");

// scrypt as the app uses it, computed independently with Node's crypto.
function nodeScrypt(text, N, dkLen) {
  const s = text.normalize("NFC");
  return new Uint8Array(crypto.scryptSync(s, s, dkLen, { N, r: 8, p: 1, maxmem: 1 << 30 }));
}

function generationKey(v) {
  return nodeScrypt([v.masterPassword, v.siteName, v.userid, v.comment].join("|"), 1 << 19, 32 + 1024);
}

function sampleOf(window, text) {
  return window.scrypttest.emojiFromKey(nodeScrypt(text, 1 << 10, 32));
}

const opened = [];

// Closes every window, including ones a failed test left open (their timers keep Node running).
function closeAll() {
  while (opened.length) opened.pop().close();
}

async function open(options) {
  const app = await openApp(options);
  opened.push(app.window);
  const { window, document } = app;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // React tracks input values; go through the native setter so onChange fires.
  async function type(sel, value) {
    const el = typeof sel === "string" ? await waitFor(() => $(sel)) : sel;
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    await tick();
  }
  async function click(sel) {
    const el = typeof sel === "string" ? await waitFor(() => $(sel)) : sel;
    el.click();
    await tick();
  }
  function button(text) {
    return $$("button").find((b) => b.textContent.trim() === text);
  }
  async function clickButton(text) {
    const b = await waitFor(() => button(text));
    if (b.disabled) throw new Error(`button "${text}" is disabled`);
    await click(b);
  }
  async function fillParams(v) {
    await waitFor(() => $("#master"));
    if (v.masterPassword !== undefined) await type("#master", v.masterPassword);
    for (const k of ["siteName", "userid", "comment", "note"]) {
      if (v[k] !== undefined) await type("#" + k, v[k]);
    }
  }
  async function generate() {
    await clickButton("Generate");
    const el = await waitFor(() => $("#password"));
    return el.value;
  }
  function errors() {
    return app.errors.filter((e) => !/Not implemented: window\.scrollTo/.test(String(e && e.message)));
  }
  return { ...app, $, $$, type, click, button, clickButton, fillParams, generate, errors, tick };
}

module.exports = { open, closeAll, waitFor, nodeScrypt, generationKey, sampleOf };
