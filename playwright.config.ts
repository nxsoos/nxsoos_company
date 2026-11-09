import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  workers: 2,
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:45173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:45173',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      COMPANY_DATA_DIR: resolve('.runtime', 'e2e-' + Date.now()),
      PORT: '44310',
      COMPANY_WEB_PORT: '45173',
    },
  },
});
