// Turn dist/hnib-event-planner.html into a body-only page for a hosted viewer
// (claude.ai Artifacts) that supplies its own <html>/<head>/<body> skeleton.
// Adds the "hosted" mode flag so exports show as copyable text and scenarios
// persist in the viewer's browser. Run after `npm run build:planner`.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("dist/hnib-event-planner.html", "utf8");
const pick = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`Could not find ${what} in dist/hnib-event-planner.html`);
  return m[0];
};
const style = pick(/<style>[\s\S]*?<\/style>/, "the stylesheet");
const defaults = pick(/<script id="hnib-planner-defaults"[^>]*>[\s\S]*?<\/script>/, "the defaults block");
const bundle = pick(/<script>\n\(function\(\)[\s\S]*<\/script>\n<\/body>/, "the bundle").replace(/\n<\/body>$/, "");

const out = [
  "<title>HNIB Event Planner</title>",
  style,
  defaults,
  '<div id="planner"></div>',
  '<script>window.HNIB_PLANNER_MODE = "hosted";</script>',
  bundle,
  "",
].join("\n");
writeFileSync("dist/hnib-event-planner.artifact.html", out);
console.log(`dist/hnib-event-planner.artifact.html  ${(out.length / 1024).toFixed(1)} kB`);
