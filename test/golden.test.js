// golden.json was recorded from the original app. This checks it against Node's own scrypt,
// so the expected values do not depend on any code in this repository.
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const golden = require("./golden.json");

test("golden.json matches the reference algorithm", () => {
  for (const v of golden) {
    const s = [v.masterPassword, v.siteName, v.userid, v.comment].join("|").normalize("NFC");
    const key = crypto.scryptSync(s, s, 32, { N: 1 << 19, r: 8, p: 1, maxmem: 1 << 30 });
    const password = key.toString("base64").replace(/[^0-9a-zA-Z]/g, "").slice(0, 8);
    assert.strictEqual(password, v.password, JSON.stringify(v));
  }
});
