// One-off: records golden.json by driving the ORIGINAL app (React 15 + MDL).
// Usage: node record-golden-legacy.js <path to legacy index.html relative to repo root>
const fs = require("node:fs");
const path = require("node:path");
const { openApp, waitFor } = require("./lib/browser");
const vectors = require("./vectors");

(async () => {
  const html = process.argv[2] || "index.html";
  const out = [];
  for (const v of vectors) {
    const { window, document, blocked } = await openApp({ html });
    const m = window.model;
    m.input.masterPassword = v.masterPassword;
    m.input.siteName = v.siteName;
    m.input.userid = v.userid;
    m.input.comment = v.comment;
    window.render();
    const button = document.querySelector("form button");
    button.click();
    const start = Date.now();
    const password = await waitFor(() => m.output.password !== "(not generated yet)" && m.output.password);
    console.error(JSON.stringify(v), "=>", password, `(${Date.now() - start}ms)`, blocked.length ? "blocked:" + blocked : "");
    out.push({ ...v, password });
    window.close();
  }
  fs.writeFileSync(path.join(__dirname, "golden.json"), JSON.stringify(out, null, 2) + "\n");
})().catch((e) => { console.error(e); process.exit(1); });
