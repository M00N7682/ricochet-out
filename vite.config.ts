import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
  server: { port: 4200 },
  preview: { port: 4200 },
})
