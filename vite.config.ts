import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vercel serves the site from the root of its own domain; GitHub Pages serves it under the
  // repo name. Vercel sets VERCEL=1 during its builds, so both deploys work from one config.
  base: process.env.VERCEL ? '/' : '/chordpro/',
})
