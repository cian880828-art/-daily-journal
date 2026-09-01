import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves this as a project page under /-daily-journal/,
  // not the domain root — only applies to the CI build so local dev
  // (npm run dev / npm run preview) keeps working at "/".
  base: process.env.GITHUB_ACTIONS ? '/-daily-journal/' : '/',
  plugins: [react()],
})
