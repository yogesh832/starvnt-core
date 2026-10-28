import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// One frontend app, one backend server. Everything under /api is proxied
// (external auth at /api/auth, admin auth/RBAC at /api/admin/*).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.VITE_DEV_PORT || 5173),
      strictPort: true,
      proxy: {
        '/api': { target: env.VITE_API_URL || 'http://localhost:4000', changeOrigin: true },
      },
    },
  };
});
