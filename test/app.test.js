// Integration tests: drive index.html in jsdom like a user would.
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { open, waitFor, generationKey, sampleOf } = require("./lib/ui");
const { ROOT } = require("./lib/browser");
const golden = require("./golden.json");
const goldenRules = require("./golden-rules.json");

async function newPassword(v, options) {
  const app = await open(options);
  await app.clickButton("New");
  await app.fillParams(v);
  const password = await app.generate();
  return { app, password };
}

test("generates the same passwords as the original app", async (t) => {
  for (const v of golden) {
    await t.test(JSON.stringify(v.masterPassword).slice(0, 30), async () => {
      // The note must not affect the password.
      const { app, password } = await newPassword({ ...v, note: "a note that is not used" });
      assert.strictEqual(password, v.password);
      assert.deepStrictEqual(app.errors(), []);
      assert.deepStrictEqual(app.blocked, []);
      app.window.close();
    });
  }
});

test("rule-based passwords are stable", async (t) => {
  const app = await open();
  const { passwordFromKey, defaultRules } = app.window.scrypttest;
  const keys = new Map();
  for (const g of goldenRules) {
    const id = JSON.stringify([g.masterPassword, g.siteName, g.userid, g.comment]);
    if (!keys.has(id)) keys.set(id, generationKey(g));
    const rules = { ...defaultRules(), ...g.rules };
    assert.strictEqual(passwordFromKey(keys.get(id), rules), g.password, JSON.stringify(g.rules));
  }
  app.window.close();
});

test("rules are applied through the UI", async () => {
  const v = golden[0];
  const app = await open();
  await app.clickButton("New");
  await app.fillParams(v);
  await app.click("details.section summary");
  await app.type("#length", "16");
  await app.type("#symbols", "require");
  await app.type("#symbolChars", "!#$%&*+-=?@^_");
  await app.click("#requireDigit");
  const password = await app.generate();
  const { passwordFromKey, satisfiesRules } = app.window.scrypttest;
  const rules = { length: 16, symbols: "require", symbolChars: "!#$%&*+-=?@^_", requireDigit: true, requireUpper: false, requireLower: false };
  assert.strictEqual(password, passwordFromKey(generationKey(v), rules));
  assert.ok(satisfiesRules(password, rules));
  // The rules are stored with the preset.
  const stored = JSON.parse(app.window.localStorage.getItem("presets"));
  assert.deepStrictEqual(stored.presets[0].rules, rules);
  app.window.close();
});

test("passwords from random keys follow the rules", async () => {
  const app = await open();
  const { passwordFromKey, satisfiesRules, defaultRules, validateRules } = app.window.scrypttest;
  const ruleSets = [
    {},
    { length: 4 },
    { length: 64 },
    { length: 10, requireDigit: true },
    { length: 6, requireDigit: true, requireUpper: true, requireLower: true },
    { length: 12, symbols: "allow" },
    { length: 12, symbols: "require", symbolChars: "@" },
    { length: 4, symbols: "require", symbolChars: "_", requireDigit: true, requireUpper: true, requireLower: true },
    { length: 30, symbols: "require", symbolChars: "a b-c-" },
  ];
  for (const r of ruleSets) {
    const rules = { ...defaultRules(), ...r };
    assert.strictEqual(validateRules(rules), null, JSON.stringify(r));
    for (let i = 0; i < 300; i++) {
      const key = new Uint8Array(crypto.randomBytes(32 + 1024));
      const password = passwordFromKey(key, rules);
      assert.ok(satisfiesRules(password, rules), `${password} ${JSON.stringify(r)}`);
      assert.strictEqual(passwordFromKey(key, rules), password);
      if (rules.symbols === "none") assert.match(password, /^[0-9A-Za-z]+$/);
      // Letters, digits and only the listed symbols ("a b-c-" allows just "-").
      if (r.symbolChars === "a b-c-") assert.match(password, /^[0-9A-Za-z-]+$/);
    }
  }
  // Default rules are exactly the original algorithm.
  for (let i = 0; i < 300; i++) {
    const key = new Uint8Array(crypto.randomBytes(32 + 1024));
    const legacy = Buffer.from(key.slice(0, 32)).toString("base64").replace(/[^0-9a-zA-Z]/g, "").slice(0, 8);
    assert.strictEqual(passwordFromKey(key, defaultRules()), legacy);
  }
  app.window.close();
});

test("invalid rules disable Generate", async () => {
  const app = await open();
  await app.clickButton("New");
  await app.fillParams({ masterPassword: "m", siteName: "s" });
  assert.strictEqual(app.button("Generate").disabled, false);
  await app.click("details.section summary");
  await app.type("#length", "3");
  assert.strictEqual(app.button("Generate").disabled, true);
  assert.match(app.$(".error").textContent, /Length/);
  await app.type("#length", "65");
  assert.strictEqual(app.button("Generate").disabled, true);
  await app.type("#length", "12");
  await app.type("#symbols", "allow");
  await app.type("#symbolChars", "abc");
  assert.strictEqual(app.button("Generate").disabled, true);
  assert.match(app.$(".error").textContent, /symbol/);
  await app.type("#symbolChars", "abc!");
  assert.strictEqual(app.button("Generate").disabled, false);
  app.window.close();
});

test("check emoji for master and generated password", async () => {
  const app = await open();
  const { EMOJI } = app.window.scrypttest;
  assert.strictEqual(EMOJI.length, 64);
  assert.strictEqual(new Set(EMOJI).size, 64);

  await app.clickButton("New");
  await app.type("#master", "password");
  const sample = await waitFor(() => app.$(".master-sample").textContent);
  assert.strictEqual(sample, sampleOf(app.window, "password"));
  assert.strictEqual([...sample].length, 3);
  await app.type("#master", "passwore");
  const other = await waitFor(() => app.$(".master-sample").textContent);
  assert.strictEqual(other, sampleOf(app.window, "passwore"));
  assert.notStrictEqual(other, sample);

  await app.type("#master", golden[0].masterPassword);
  await app.fillParams(golden[0]);
  const password = await app.generate();
  const passwordSample = await waitFor(() => app.$(".password-sample").textContent);
  assert.strictEqual(passwordSample, sampleOf(app.window, password));
  app.window.close();
});

test("secrets are hidden unless focused, and can be copied", async () => {
  const { app, password } = await newPassword(golden[0]);
  const out = app.$("#password");
  assert.strictEqual(out.type, "password");
  out.focus();
  await waitFor(() => app.$("#password").type === "text");
  out.blur();
  await waitFor(() => app.$("#password").type === "password");

  await app.clickButton("Copy");
  await waitFor(() => app.window.navigator.clipboard.written.length);
  assert.deepStrictEqual(app.window.navigator.clipboard.written, [password]);

  await app.clickButton("Back");
  const master = await waitFor(() => app.$("#master"));
  assert.strictEqual(master.type, "password");
  master.focus();
  await waitFor(() => app.$("#master").type === "text");
  master.blur();
  await waitFor(() => app.$("#master").type === "password");
  app.window.close();
});

test("secrets are cleared after the timeout", async () => {
  const { app } = await newPassword(golden[0]);
  const m = app.window.scrypttest.model;
  m.output.generatedAt = 0;
  await waitFor(() => !app.$("#password"), { timeout: 3000 });
  assert.match(app.$(".status").textContent, /Cleared/);
  m.input.lastUpdateMasterPassword = 0;
  await waitFor(() => m.input.masterPassword === "", { timeout: 3000 });
  app.window.close();
});

test("generation can be cancelled", async () => {
  const app = await open();
  await app.clickButton("New");
  await app.fillParams(golden[0]);
  await app.clickButton("Generate");
  await app.clickButton("Cancel");
  assert.match(app.$(".status").textContent, /Cancelled/);
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual(app.$("#password"), null);
  assert.ok(app.button("Back"));
  app.window.close();
});

test("presets are saved, listed, loaded, searched and deleted", async () => {
  const v = { ...golden[2], note: "my note" };
  const first = await newPassword(v);
  const storage = { presets: first.app.window.localStorage.getItem("presets") };
  first.app.window.close();

  const app = await open({ storage });
  const items = await waitFor(() => app.$$(".preset").length && app.$$(".preset"));
  assert.strictEqual(items.length, 1);
  assert.match(items[0].textContent, /google\.com/);
  assert.match(items[0].textContent, /my note/);
  await app.click(".preset-main");
  assert.strictEqual(app.$("#siteName").value, v.siteName);
  assert.strictEqual(app.$("#userid").value, v.userid);
  assert.strictEqual(app.$("#comment").value, v.comment);
  assert.strictEqual(app.$("#note").value, v.note);
  assert.strictEqual(app.$("#master").value, "");

  // Save preset without generating.
  await app.type("#comment", "second");
  await app.clickButton("Save preset");
  await app.clickButton("Back");
  await waitFor(() => app.$$(".preset").length === 2);
  assert.match(app.$$(".preset")[0].textContent, /second/);

  await app.type(".search", "SECOND");
  assert.strictEqual(app.$$(".preset").length, 1);
  await app.type(".search", "nothing matches");
  assert.strictEqual(app.$$(".preset").length, 0);
  await app.type(".search", "");

  app.window.confirm = () => true;
  await app.click(app.$$(".preset .danger")[0]);
  assert.strictEqual(app.$$(".preset").length, 1);
  assert.strictEqual(JSON.parse(app.window.localStorage.getItem("presets")).presets.length, 1);
  app.window.close();
});

test("old history is migrated to presets", async () => {
  const histories = JSON.stringify([
    { siteName: "example.com", userid: "alice", comment: "" },
    { siteName: "foo.org", userid: "bob", comment: "x" },
  ]);
  const app = await open({ storage: { histories } });
  await waitFor(() => app.$$(".preset").length === 2);
  const stored = JSON.parse(app.window.localStorage.getItem("presets"));
  assert.strictEqual(stored.format, "scrypttest-presets");
  assert.deepStrictEqual(stored.presets.map((p) => p.siteName), ["example.com", "foo.org"]);
  assert.strictEqual(stored.presets[0].note, "");
  assert.strictEqual(stored.presets[0].rules.length, 8);
  assert.strictEqual(app.window.localStorage.getItem("histories"), histories);
  app.window.close();
});

test("presets can be exported and imported", async () => {
  const existing = JSON.stringify({
    format: "scrypttest-presets",
    version: 1,
    presets: [
      { siteName: "a.com", userid: "u", comment: "", note: "old", rules: { length: 8 } },
      { siteName: "b.com", userid: "u", comment: "", note: "", rules: {} },
    ],
  });
  const app = await open({ storage: { presets: existing } });
  const { importPresetsText, presetsJson, model } = app.window.scrypttest;

  let downloaded = null;
  app.window.URL.createObjectURL = (blob) => { downloaded = blob; return "blob:x"; };
  app.window.URL.revokeObjectURL = () => {};
  await app.click("details.section summary");
  await app.clickButton("Export");
  assert.ok(downloaded);
  assert.deepStrictEqual(JSON.parse(presetsJson()).presets.map((p) => p.siteName), ["a.com", "b.com"]);

  const count = importPresetsText(JSON.stringify({
    format: "scrypttest-presets",
    version: 1,
    presets: [
      { siteName: "a.com", userid: "u", comment: "", note: "new", rules: { length: 12, symbols: "allow" } },
      { siteName: "c.com", userid: "", comment: "", note: "" },
      { siteName: "", userid: "", comment: "" },
      "garbage",
    ],
  }));
  assert.strictEqual(count, 2);
  assert.deepStrictEqual([...model.presets.map((p) => p.siteName)], ["a.com", "b.com", "c.com"]);
  assert.strictEqual(model.presets[0].note, "new");
  assert.strictEqual(model.presets[0].rules.length, 12);
  assert.strictEqual(model.presets[2].rules.length, 8);
  assert.throws(() => importPresetsText("{}"));
  assert.throws(() => importPresetsText("not json"));

  // Through the file input.
  app.window.File.prototype.text = function () {
    return new Promise((resolve) => {
      const reader = new app.window.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(this);
    });
  };
  const fileInput = app.$("input[type=file]");
  const file = new app.window.File([JSON.stringify([{ siteName: "d.com", userid: "", comment: "" }])], "p.json");
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fileInput.dispatchEvent(new app.window.Event("change", { bubbles: true }));
  await waitFor(() => model.presets.length === 4, { timeout: 3000 });
  await waitFor(() => /Imported 1 presets/.test(app.$(".notice") && app.$(".notice").textContent), { timeout: 3000 });
  assert.strictEqual(JSON.parse(app.window.localStorage.getItem("presets")).presets.length, 4);
  app.window.close();
});

test("bookmarklet URL picks the preset for the site", async (t) => {
  const presets = (names) => JSON.stringify({
    format: "scrypttest-presets",
    version: 1,
    presets: names.map(([siteName, userid]) => ({ siteName, userid, comment: "" })),
  });
  const query = "?url=" + encodeURIComponent("https://login.www.example.co.uk/path?x=1");

  await t.test("one match: opens it", async () => {
    const app = await open({ query, storage: { presets: presets([["example.co.uk", "alice"], ["other.com", "bob"]]) } });
    await waitFor(() => app.$("#siteName"), { timeout: 10000 });
    assert.strictEqual(app.$("#siteName").value, "example.co.uk");
    assert.strictEqual(app.$("#userid").value, "alice");
    assert.deepStrictEqual(app.blocked, []);
    app.window.close();
  });

  await t.test("no match: new preset for the site", async () => {
    const app = await open({ query });
    await waitFor(() => app.$("#siteName"), { timeout: 10000 });
    assert.strictEqual(app.$("#siteName").value, "example.co.uk");
    assert.strictEqual(app.$("#userid").value, "");
    app.window.close();
  });

  await t.test("several matches: lets the user choose", async () => {
    const app = await open({ query, storage: { presets: presets([["example.co.uk", "alice"], ["example.co.uk", "bob"], ["x.com", "c"]]) } });
    await waitFor(() => app.$(".search") && app.$(".search").value === "example.co.uk", { timeout: 10000 });
    assert.strictEqual(app.$$(".preset").length, 2);
    await app.clickButton("New");
    assert.strictEqual(app.$("#siteName").value, "example.co.uk");
    app.window.close();
  });
});

test("the page loads nothing from the network", async () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) {
    assert.doesNotMatch(m[1], /^(https?:)?\/\//, m[0]);
  }
  const app = await open();
  await waitFor(() => app.button("New"));
  assert.deepStrictEqual(app.blocked, []);
  assert.deepStrictEqual(app.errors(), []);
  app.window.close();
});
