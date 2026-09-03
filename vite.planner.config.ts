import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";

// Second build: the standalone event planner as ONE html file that opens by
// double-click (file://) with no network. Everything is inlined: the script
// as a classic (non-module) tag so file:// never trips CORS, the stylesheet,
// and the logo as a data URL. Output: dist/hnib-event-planner.html.

const OUTPUT_NAME = "hnib-event-planner.html";

function inlineEverything(): Plugin {
  return {
    name: "hnib-inline-single-file",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === "asset" && f.fileName.endsWith(".html"));
      if (!html || html.type !== "asset") return;
      let out = String(html.source);

      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === "chunk") {
          // Vite hoists the module script into <head>; a classic inline script
          // there would run before the mount point exists, so it goes to the
          // end of <body> instead.
          const tag = new RegExp(`<script[^>]*src="[^"]*${escape(name)}"[^>]*></script>`);
          out = out.replace(tag, "");
          const inline = `<script>\n${file.code.replace(/<\/script/gi, "<\\/script")}\n</script>\n</body>`;
          out = out.replace(/<\/body>/, () => inline);
          delete bundle[name];
        } else if (name.endsWith(".css")) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${escape(name)}"[^>]*>`);
          out = out.replace(tag, () => `<style>\n${String(file.source)}\n</style>`);
          delete bundle[name];
        }
      }
      // Vite adds crossorigin/modulepreload attributes meant for served files.
      out = out.replace(/<link rel="modulepreload"[^>]*>/g, "");
      delete bundle[html.fileName];
      this.emitFile({ type: "asset", fileName: OUTPUT_NAME, source: out });
    },
  };
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default defineConfig({
  base: "./",
  plugins: [preact(), inlineEverything()],
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000, // every asset becomes a data URL
    cssCodeSplit: false,
    modulePreload: false,
    minify: false, // keep the bundled source readable for staff edits
    rollupOptions: {
      input: "planner.html",
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "planner-[hash].js",
        assetFileNames: "planner-[hash][extname]",
      },
    },
  },
});
