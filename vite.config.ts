import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: Number(process.env.COMPANY_WEB_PORT || 5173),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT || 4310}` },
  },
});
