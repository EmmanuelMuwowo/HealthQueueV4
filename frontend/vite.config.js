import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Fixed ports: the backend only accepts requests from these two addresses
  server: { port: 5180, strictPort: true },   // npm run dev
  preview: { port: 4180, strictPort: true },  // npm run preview (built version, offline mode)
})