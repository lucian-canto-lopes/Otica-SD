import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O build vai para app/public: o Nginx (Docker) ou o Apache (XAMPP) servem os arquivos estáticos.
// Em desenvolvimento, /api é encaminhado para a API PHP local.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../app/public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_TARGET || 'http://localhost/Otica-SD/app',
        changeOrigin: true,
      },
    },
  },
});
