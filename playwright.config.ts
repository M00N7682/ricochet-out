import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4200', ...devices['iPhone 14 Pro'], browserName: 'chromium' },
  webServer: { command: 'npx vite preview --port 4200 --strictPort', port: 4200, reuseExistingServer: true },
})
