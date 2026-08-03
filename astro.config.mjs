// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  // Routing is hand-rolled: English is served unprefixed from src/pages/, and
  // each additional locale gets a src/pages/<lang>/ directory plus an entry in
  // LANGS (src/i18n/strings.ts). Astro's built-in `i18n` option is deliberately
  // not used — it would duplicate that with a second source of truth.
  integrations: [mdx()],
});