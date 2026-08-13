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
            // Split, not bundled together: only the analyzer needs charts,
            // only import/export pages need xlsx.
            if (id.includes('xlsx')) return 'xlsx';
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'charts';
            return 'vendor';
          }
        }
      }
    }
  }
});
