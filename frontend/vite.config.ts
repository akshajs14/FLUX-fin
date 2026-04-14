import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port matches the OAuth redirect URL registered in Palantir Foundry Developer Console:
// http://localhost:8080
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    // If 8080 is taken, fail instead of jumping to 8081/8082 — OAuth redirect must match the URL you use.
    strictPort: true,
  },
  preview: {
    port: 8080,
    strictPort: true,
  },
});
