import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, Vite runs on :5173 and forwards API + Socket.IO calls to the
// Express server on :3000, so the app can always use relative URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on the LAN, not only localhost
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
