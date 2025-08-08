import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Set base for GitHub Pages project site deployments
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/JavascriptChallenges/' : '/',
  plugins: [react()],
}))
