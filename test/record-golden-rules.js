// One-off: records golden-rules.json, the outputs of the rule-based generator.
// Re-recording changes the expectations; only do it before rules are used for real passwords.
const fs = require("node:fs");
const path = require("node:path");
const { open, generationKey } = require("./lib/ui");
const golden = require("./golden.json");
const ruleSets = require("./rule-sets");

(async () => {
  const app = await open();
  const { passwordFromKey, rulesOf } = app.window.scrypttest;
  const out = [];
  for (const v of golden.slice(0, 3)) {
    const key = generationKey(v);
    for (const rule of ruleSets) {
      out.push({ masterPassword: v.masterPassword, siteName: v.siteName, userid: v.userid, comment: v.comment, rule, password: passwordFromKey(key, rulesOf(rule)) });
    }
  }
  app.window.close();
  fs.writeFileSync(path.join(__dirname, "golden-rules.json"), JSON.stringify(out, null, 2) + "\n");
  for (const o of out) console.log(o.rule, o.password);
})().catch((e) => { console.error(e); process.exit(1); });
