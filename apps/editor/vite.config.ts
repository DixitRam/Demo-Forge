import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { scriptPlugin } from './vite-script.js';
import { ttsPlugin } from './vite-tts.js';

export default defineConfig({
  plugins: [react(), tailwindcss(), ttsPlugin(), scriptPlugin()],
  server: {
    // ffmpeg.wasm wants a cross-origin-isolated context for its threaded core.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Linked workspace source, not a prebundled dependency.
  optimizeDeps: { exclude: ['@demoforge/core'] },
});
