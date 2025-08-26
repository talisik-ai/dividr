import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Remove ffmpeg-static and ffprobe-static from external dependencies
      // This allows them to be properly bundled and resolved in the built app
      external: [
        // Keep other external dependencies as needed
        // 'ffmpeg-static', // REMOVED - this was causing the issue
        // 'ffprobe-static', // REMOVED - this was causing the issue
      ],
    },
  },
});
