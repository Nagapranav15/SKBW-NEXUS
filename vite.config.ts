import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) {
              return 'ui-icons';
            }
            if (id.includes('xlsx') || id.includes('chart.js') || id.includes('react-chartjs-2')) {
              return 'data-libs';
            }
            return 'vendor';
          }
        }
      }
    }
  }
});
