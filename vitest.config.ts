import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Database tests share one local Supabase database, so files run one at a
// time. `npm run test:db` resets the database before and after.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: loadEnv('', process.cwd(), ''),
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
