import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// base: './' makes all asset paths relative so the built bundle works whether it
// lives at the SiteGround domain root (public_html/) or a subfolder
// (public_html/tournament/) with no .htaccess rewrites.
export default defineConfig({
  base: "./",
  plugins: [preact()],
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
