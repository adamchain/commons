import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ngrok URLs change each session; allow the whole domain.
    allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io"],
    // Browser talks to this dev server (including via ngrok). Forward API
    // calls to the local server so login is not a cross-origin localhost fetch.
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/plans": {
        target: "http://localhost:4000",
        changeOrigin: true,
        bypass(req) {
          if (req.url && req.url.includes("/og-image.png")) return undefined;
          return req.url;
        },
      },
    },
  },
})
