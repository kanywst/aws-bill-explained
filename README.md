# AWS Bill Explained

[English](README.md) · [日本語](README.ja.md)

Every AWS bill is three meters. Learn the three and a pricing page stops being a lesson and becomes a lookup.

AWS documents pricing one service at a time, so every new service looks like a new billing model. It isn't. Three meters exist, and a service either has a given meter or it doesn't:

| Meter     | The question it answers         | What it counts                                                                       |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| **Time**  | Does the thing exist?           | Capacity × duration                                                                  |
| **Bytes** | Is anything counting gigabytes? | Transfer out of a boundary, and per-GB processing wherever a device sits in the path |
| **Calls** | Did you invoke the API?         | API operations; size and direction are irrelevant                                    |

The second meter is called Bytes rather than Egress on purpose. "Inbound is free" is a rule about data _transfer_, not a property of the meter: a NAT Gateway, an interface endpoint or a log pipeline charges per gigabyte in both directions.

This site classifies AWS services against those three, explains the one thing people get wrong about each, and names the usage type to search for on your own bill.

## Principles

- **No dollar rates in the dataset.** Rates move and vary by region; which meter turns does not. The `Service` constructor rejects a record whose prose quotes one.
- **Every claim carries a source** and a date it was checked against AWS documentation. Both are enforced by the model, not by convention.
- **Lit means billed, dim means free** in every diagram, so you can find the money before reading a word.
- **Model before detail.** Each page opens with a single sentence, then earns it.

Unofficial. Not affiliated with Amazon Web Services.

## Commands

```bash
npm install
npm run dev      # local dev server
npm run test     # domain, layout, i18n and catalogue tests
npm run check    # lint + types + tests + build guards — what CI runs
npm run build    # static build into dist/
```

## Layout

```text
src/
  domain/          pure TypeScript, knows nothing about Astro or locales
    meter.ts       MeterSet value object
    service-slug.ts  ServiceSlug value object — identity that validates itself
    service.ts     Service entity; the constructor enforces editorial rules
    catalogue.ts   Catalogue aggregate — every cross-service query lives here
  infrastructure/
    service-repository.ts   anti-corruption layer over the researched JSON
  lib/
    diagram-layout.ts   SVG geometry, extracted so it can be unit-tested
  data/services/   one JSON file per category, the researched dataset
  content/topics/  long-form deep dives, <lang>/<slug>.mdx
  components/      presentation, including the SVG diagram components
  pages/           routes; English unprefixed, other locales under /<lang>/
scripts/
  check-build.mjs     post-build guards for what a type checker cannot see
  check-sources.mjs   verifies every cited AWS URL still resolves
  merge-services.mjs  folds a research batch into the per-category dataset
```

Service pages are generated from the catalogue, so adding a service is a data change, not a code change.

### Why a domain layer

The dataset is assembled from independent research passes that disagree about naming (`amazon-s3` vs `s3`) and occasionally emit a meter string nobody has seen before. `ServiceSlug` makes identity impossible to get wrong — the only way to hold one is to have gone through its constructor — and the repository drops unknown meters rather than throwing, so a new AWS billing shape degrades to "we don't know" instead of breaking the build.

The editorial limits live in the `Service` constructor rather than in a test over the committed data. A test can only catch a bad record that has already been written; a constructor makes it unbuildable.

Cross-service questions — what's free, what bills the same way, how much of the catalogue is still unverified — belong to `Catalogue`, not to page templates. That keeps the meaning of "free" in one place.

### Why the geometry is a separate module

`src/lib/diagram-layout.ts` holds the arithmetic behind the SVG diagrams. It was extracted after the boundary map shipped a ring with `height="-40"`, which type-checked perfectly, threw a console error in the browser, and silently dropped the innermost ring — the one the diagram exists to show. Writing the tests then surfaced the same defect still latent on the horizontal axis.

### Why the build guards

`npm run build` runs `scripts/check-build.mjs` afterwards. It scans the built HTML for negative SVG dimensions and `NaN` coordinates, checks translation parity, and requires a checked date on every topic — a second net under the unit tests, catching anything a component composes wrongly at render time.

## Adding a service

Add an object to the matching file in `src/data/services/`:

```json
{
  "slug": "example",
  "name": "AWS Example",
  "category": "compute",
  "meters": ["time", "bytes"],
  "oneLiner": "One sentence a reader can carry away.",
  "trap": "The specific thing people get wrong about this service.",
  "billOn": ["ExampleUsage-Hours"],
  "confidence": "high",
  "sources": ["https://aws.amazon.com/example/pricing/"],
  "checked": "2026-08-04"
}
```

`meters` accepts `egress` as an alias for `bytes`; the repository translates it. Everything else is enforced: the build fails if the slug collides or is not URL-safe, the source is not an AWS-controlled domain, the prose quotes a dollar amount or runs long, or the checked date is missing.

Use `node scripts/merge-services.mjs batch.json` to fold a research batch into the right per-category files without duplicating a slug across two of them.

## Adding a locale

Add it to `LANGS` in `src/i18n/strings.ts`, fill in the string bundle, and create `src/pages/<lang>/`. Nothing else in the site is locale-aware, and a test asserts every locale carries the same key set. Pages that exist in only one language grey out in the language switcher rather than linking to a 404.
