// Compiles the text/jsise scripts of a page with the vendored jsise.js and returns the JavaScript.
// Usage: node lib/compile-jsise.js [page.html]   (prints the generated code; useful for debugging)
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const RUNNER = 'eval(jsise.codegen(jsise.convert(jsise.macro(Array.prototype.concat.apply([],[stdlib,jsise.parser(ss[e].textContent)]),{}))))';

function compilePage(html = "index.html") {
  const page = fs.readFileSync(path.join(ROOT, html), "utf8");
  const sources = [...page.matchAll(/<script type="text\/jsise">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const runtime = fs.readFileSync(path.join(ROOT, "jsise.js"), "utf8");
  if (!runtime.includes(RUNNER)) throw new Error("jsise.js changed; update RUNNER in compile-jsise.js");
  const outputs = [];
  const context = {
    __out: outputs,
    document: { getElementsByTagName: () => sources.map((textContent) => ({ type: "text/jsise", textContent })) },
  };
  vm.runInNewContext(runtime.replace(RUNNER, "__out.push(" + RUNNER.slice(5, -1) + ")"), context);
  return outputs;
}

if (require.main === module) {
  console.log(compilePage(process.argv[2]).join("\n\n"));
}

module.exports = { compilePage };
