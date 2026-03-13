import { resolve } from "path";
import { defineConfig } from "vite";
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
        "content/picker": resolve(__dirname, "src/content/picker.ts"),
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
