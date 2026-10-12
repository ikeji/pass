// One-off: records golden-rules.json, the outputs of the rule-based generator.
// Re-recording changes the expectations; only do it before rules are used for real passwords.
const fs = require("node:fs");
const path = require("node:path");
const { open, generationKey } = require("./lib/ui");
const golden = require("./golden.json");
const ruleSets = require("./rule-sets");

(async () => {
  const app = await open();
  const { passwordFromKey, defaultRules } = app.window.scrypttest;
  const out = [];
  for (const v of golden.slice(0, 3)) {
    const key = generationKey(v);
    for (const r of ruleSets) {
      const rules = { ...defaultRules(), ...r };
      out.push({ masterPassword: v.masterPassword, siteName: v.siteName, userid: v.userid, comment: v.comment, rules: r, password: passwordFromKey(key, rules) });
    }
  }
  app.window.close();
  fs.writeFileSync(path.join(__dirname, "golden-rules.json"), JSON.stringify(out, null, 2) + "\n");
  for (const o of out) console.log(JSON.stringify(o.rules), o.password);
})().catch((e) => { console.error(e); process.exit(1); });
