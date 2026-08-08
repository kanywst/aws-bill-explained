// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // The canonical origin, needed for the sitemap and the social card metadata.
  // Deliberately no `base`: every internal link is built by localePath() from a
  // root-relative path, so serving from a sub-path would need those rewritten
  // too. Set that up when a deploy target is actually chosen, not before.
  site: 'https://aws-bill-explained.pages.dev',

  // Routing is hand-rolled: English is served unprefixed from src/pages/, and
  // each additional locale gets a src/pages/<lang>/ directory plus an entry in
  // LANGS (src/i18n/strings.ts). Astro's built-in `i18n` option is deliberately
  // not used. It would duplicate that with a second source of truth.
  integrations: [
    mdx(),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', ja: 'ja' },
      },
    }),
  ],
});
