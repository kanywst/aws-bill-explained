import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { AWS_SOURCE } from './domain/service';

/**
 * The whole site is built on one promise: you get the model before the detail.
 * The schema enforces it — a topic cannot exist without `oneLiner`, and
 * `oneLiner` is capped so it stays a sentence you can hold in your head.
 */
const topics = defineCollection({
  // Files live at src/content/topics/<lang>/<slug>.mdx, so the entry id is
  // "en/ec2" and the locale is readable straight off the id.
  loader: glob({ pattern: '**/*.mdx', base: './src/content/topics' }),
  schema: z.object({
    title: z.string(),
    /** 「ひとことで言うと」. Rendered before anything else, at display size. */
    oneLiner: z.string().max(120),
    /** Sub-navigation label. Falls back to title when omitted. */
    short: z.string().optional(),
    /** Which of the three meters this topic turns. Drives the badges. */
    meters: z.array(z.enum(['time', 'bytes', 'units'])).default([]),
    /** Lower sorts first. */
    order: z.number().default(100),
    /** Last time a human checked this against the AWS docs. */
    checked: z.date(),
    /**
     * AWS pages the article's claims rest on. Every service record carries
     * these and gets its links checked in CI; the articles make just as many
     * verifiable claims and carried nothing but a date. Restricted to
     * AWS-controlled hosts by the Service entity's own rule — imported rather
     * than restated, because two copies of it drift and then the catalogue and
     * the articles disagree about what counts as a citation.
     */
    sources: z
      .array(
        z
          .string()
          .refine((u) => AWS_SOURCE.test(u), { message: 'source must be an AWS-controlled page' }),
      )
      .default([]),
  }),
});

export const collections = { topics };
