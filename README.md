# AWS Bill Explained

Every AWS bill is three meters. Learn the three and a pricing page stops being a lesson and becomes a lookup.

AWS documents pricing one service at a time, so every new service looks like a new billing model. It isn't. Three meters exist, and a service either has a given meter or it doesn't:

| Meter      | The question it answers                    | What it counts                                    |
| ---------- | ------------------------------------------ | ------------------------------------------------- |
| **Time**   | Does the thing exist?                      | Capacity × duration                               |
| **Egress** | Did bytes cross a boundary on the way out? | Gigabytes leaving; inbound is free                |
| **Calls**  | Did you invoke the API?                    | API operations; size and direction are irrelevant |

This site classifies every AWS service against those three, explains the one thing people get wrong about each, and tells you which usage type to search for on your own bill.

## Principles

- **No dollar rates in the dataset.** Rates move and vary by region; which meter turns does not. Enforced by a test.
- **Every claim carries a source** and a date it was checked against AWS documentation. Enforced by a test.
- **Lit means billed, dim means free** in every diagram, so you can find the money before reading a word.
- **Model before detail.** Each page opens with a single sentence, then earns it.

Unofficial. Not affiliated with Amazon Web Services.

## Commands

```bash
npm install
npm run dev      # local dev server
npm run test     # domain + catalogue tests
npm run check    # astro check + tests + post-build guards — what CI runs
npm run build    # static build into dist/
```

## Layout

```text
src/
  domain/          pure TypeScript, knows nothing about Astro or locales
    meter.ts       MeterSet value object
    service.ts     Service entity, identified by slug
    catalogue.ts   Catalogue aggregate — every cross-service query lives here
  infrastructure/
    service-repository.ts   anti-corruption layer over the researched JSON
  data/services/   one JSON file per category, the researched dataset
  content/topics/  long-form deep dives, <lang>/<slug>.mdx
  components/      presentation, including the SVG diagram components
  pages/           routes; English unprefixed, other locales under /<lang>/
scripts/
  check-build.mjs  post-build guards for things a type checker cannot see
```

Service pages are generated from the catalogue, so adding a service is a data change, not a code change.

### Why a domain layer

The dataset is assembled from independent research passes that disagree about naming (`amazon-s3` vs `s3`) and occasionally emit a meter string nobody has seen before. The repository normalises identity at the boundary and drops unknown meters rather than throwing, so a new AWS billing shape degrades to "we don't know" instead of breaking the build. Everything downstream gets clean domain objects.

Cross-service questions — what's free, what bills the same way, how much of the catalogue is still unverified — belong to `Catalogue`, not to page templates. That keeps the meaning of "free" in one place.

### Why the build guards

`npm run build` runs `scripts/check-build.mjs` afterwards. Diagram geometry is arithmetic that no type checker inspects: a ring rendered at `height="-40"` type-checks perfectly and silently disappears in the browser. The guards scan the built HTML for negative SVG dimensions and `NaN` coordinates, check translation parity, and require a checked date on every topic.

## Adding a service

Add an object to the matching file in `src/data/services/`:

```json
{
  "slug": "example",
  "name": "AWS Example",
  "category": "compute",
  "meters": ["time", "egress"],
  "oneLiner": "One sentence a reader can carry away.",
  "trap": "The specific thing people get wrong about this service.",
  "billOn": ["ExampleUsage-Hours"],
  "confidence": "high",
  "sources": ["https://aws.amazon.com/example/pricing/"],
  "checked": "2026-08-04"
}
```

`npm run test` rejects it if the slug collides, the source is not an AWS-controlled domain, the prose quotes a dollar amount, or the checked date is missing.

## Adding a locale

Add it to `LANGS` in `src/i18n/strings.ts`, fill in the string bundle, and create `src/pages/<lang>/`. Nothing else in the site is locale-aware. Pages that exist in only one language grey out in the language switcher rather than linking to a 404.
