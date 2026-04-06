import { resolve } from "path";
import { defineConfig, type Plugin } from "vite";
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'fs';

/**
 * Build content scripts as self-contained IIFE bundles via esbuild.
 * Content scripts injected via chrome.scripting.executeScript can't use
 * ES module imports, so they must be fully inlined.
 */
function contentScriptPlugin(): Plugin {
  const contentScripts = [
    { entry: resolve(__dirname, "src/content/picker.ts"), out: "content/picker.js" },
    { entry: resolve(__dirname, "src/content/recorder.ts"), out: "content/recorder.js" },
    { entry: resolve(__dirname, "src/content/trace-loader.ts"), out: "content/trace-loader.js" },
  ];
  return {
    name: 'content-script-bundle',
    async writeBundle(options) {
      const outDir = options.dir ?? resolve(__dirname, "dist");
      for (const { entry, out } of contentScripts) {
        const result = await build({
          entryPoints: [entry],
          bundle: true,
          format: 'iife',
          write: false,
          sourcemap: true,
          minify: false,
        });
        for (const file of result.outputFiles) {
          const outPath = resolve(outDir, file.path.endsWith('.map') ? out + '.map' : out);
          mkdirSync(resolve(outPath, '..'), { recursive: true });
          writeFileSync(outPath, file.contents);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentScriptPlugin()],
  root: "src",
  base: "",
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/panel')
    }
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background.ts"),
        "panel/panel": resolve(__dirname, "src/panel/panel.html"),
        "preferences/preferences": resolve(__dirname, "src/preferences/preferences.html"),
        "offscreen/offscreen": resolve(__dirname, "src/offscreen/offscreen.html"),
        "devtools/devtools": resolve(__dirname, "src/devtools/devtools.html"),
        "devtools/console": resolve(__dirname, "src/devtools/console.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  publicDir: resolve(__dirname, "public"),
});
