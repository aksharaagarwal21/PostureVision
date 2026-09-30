import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works from any sub-path
  // (e.g. https://<user>.github.io/PostureVision/)
  base: './',
})
