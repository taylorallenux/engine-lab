import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        engineLab: 'engine-lab.html',
      },
    },
  },
  server: {
    open: '/engine-lab.html',
  },
});
