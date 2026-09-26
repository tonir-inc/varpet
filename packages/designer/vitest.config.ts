import { defineConfig } from 'vitest/config';

// Several tests run whole furnishing passes (2-6 s alone); under a busy machine the 5 s default trips them.
export default defineConfig({ test: { testTimeout: 20_000 } });
