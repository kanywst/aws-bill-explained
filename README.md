# AWS Bill Explained

[English](README.md) · [日本語](README.ja.md)

Every AWS bill is three meters. Learn the three and a pricing page stops being a lesson and becomes a lookup.

AWS documents pricing one service at a time, so every new service looks like a new billing model. It isn't. Three meters exist, and a service either has a given meter or it doesn't:

| Meter     | The question it answers                                                     | What it counts                                                               |
| --------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Time**  | Does the thing exist?                                                       | Something exists × how long it existed                                       |
| **Bytes** | Did bytes cross a boundary, pass through a box, or get read where they sat? | Gigabytes leaving, gigabytes handled in the path, gigabytes scanned in place |
| **Units** | How many discrete things did you ask for?                                   | Requests, tokens, pages, characters, recipients, payload slices              |

Two of the three have been renamed, both times because the name was narrower than the shape and quietly excluded valid members.

**Bytes** was Egress until the dataset contradicted it: CloudWatch ingestion, Firehose intake and NAT Gateway processing all meter gigabytes with no regard for direction. "Inbound is free" is a rule about data _transfer_, not a property of the meter.

**Units** was Calls, defined as "the number of API operations; payload size and direction are irrelevant". That described one implementation rather than a billing shape, and most of its own members refuted it: SQS bills a 1 MiB call as sixteen requests, Bedrock counts tokens, Textract counts pages, SES counts recipients. What they share is that something discrete gets counted. A request is the commonest instance of that, not the definition of it.

This site classifies AWS services against those three, explains the one thing people get wrong about each, and names the usage type to search for on your own bill.

## Principles

- **No dollar rates in the dataset.** Rates move and vary by region; which meter turns does not. The `Service` constructor rejects a record whose prose quotes one.
- **Every claim carries an AWS source** and a date it was checked. The `Service` constructor rejects a record with no source, or one citing a page outside AWS's own domains.
- **Colour means billed, grey means free** in every diagram, and never colour alone, since it also has to work in greyscale and for a screen reader.
- **Model before detail.** Each page opens with a single sentence, then earns it.

Unofficial. Not affiliated with Amazon Web Services.

## Commands

```bash
npm install
npm run dev         # local dev server
npm run test        # domain, layout, i18n and catalogue tests
npm run test:smoke  # opens the built pages in a browser (needs npm run build first)
npm run check       # lint + types + tests + build + smoke (CI also runs actionlint, coverage thresholds, npm audit and the source checker)
npm run build       # static build into dist/
```

`npm run test:smoke` serves `dist/` through `scripts/serve-dist.mjs`, which applies the rules in `public/_headers`. That is deliberate: `astro preview` ignores those headers, and the last thing these tests caught lived in them rather than in the page.

## Layout

```text
src/
  domain/          pure TypeScript, knows nothing about Astro or locales
    meter.ts       MeterSet value object
    service-slug.ts  ServiceSlug value object. Identity that validates itself
    service.ts     Service entity; the constructor enforces editorial rules
    catalogue.ts   Catalogue aggregate. Every cross-service query lives here
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

The dataset is assembled from independent research passes that disagree about naming (`amazon-s3` vs `s3`) and occasionally emit a meter string nobody has seen before. `ServiceSlug` makes identity impossible to get wrong (the only way to hold one is to have gone through its constructor), and the repository drops unknown meters rather than throwing, so a new AWS billing shape degrades to "we don't know" instead of breaking the build.

The editorial limits live in the `Service` constructor rather than in a test over the committed data. A test can only catch a bad record that has already been written; a constructor makes it unbuildable.

Cross-service questions (what's free, what bills the same way, how much of the catalogue is still unverified) belong to `Catalogue`, not to page templates. That keeps the meaning of "free" in one place.

### Why the geometry is a separate module

`src/lib/diagram-layout.ts` holds the arithmetic behind the SVG diagrams. It was extracted after the boundary map shipped a ring with `height="-40"`, which type-checked perfectly, threw a console error in the browser, and silently dropped the innermost ring, the one the diagram exists to show. Writing the tests then surfaced the same defect still latent on the horizontal axis.

### Why the build guards

`npm run build` runs two scripts afterwards.

`scripts/csp-hashes.mjs` hashes every inline script in the build and writes those hashes into the `script-src` directive in `dist/_headers`. Astro emits small scripts inline rather than as files, and the policy is `script-src 'self'`, so without this the browser refuses to run them: the home page's cost counter stops and the services filter does nothing, with valid HTML and a green build. The hashes change whenever the code does, which is why they are generated rather than pasted, and why the answer is not `'unsafe-inline'`.

`scripts/check-build.mjs` then scans the built HTML for negative SVG dimensions and `NaN` coordinates, checks translation parity, requires a checked date and at least one source on every topic, and fails if any inline script is missing from the policy above. It is a second net under the unit tests, catching what a component composes wrongly at render time, and `npm run test:smoke` is the third, catching what only a browser can see.

## Keeping it current

Nothing here decays because the code changed. It decays because AWS did: a page is retired, a rate moves, a whole product line is renamed while every URL describing it still returns 200. Two checks look for that, and they ask different questions.

`scripts/check-sources.mjs` asks whether a cited page is still there. It follows redirects and treats a page that lands on its guide index as gone, because that is how AWS retires documentation: not with a 404, but with a 200 somewhere less specific.

`scripts/check-freshness.mjs` asks whether anyone has looked lately. Every service record and every article carries a `checked` date; the script warns past 90 days and, with `--strict`, fails past 180.

Both run on every push. Both also run weekly in `.github/workflows/claims.yml`, which is the one that matters: a scheduled failure has no pull request to turn red, so it files an issue under the `claims` label instead, or comments on the open one if there already is one.

When a claim comes up stale, re-verify it against a primary AWS source and move the date. Moving the date without re-reading the source is the one thing that turns this from a check into a ritual.

Both of those read the record. Neither reads the prose, and that is where this site has actually broken: a count typed into an article while the catalogue grew past it, a meter renamed in one locale and not the other. `check-build.mjs` verifies that both locales carry the same keys, which is precisely why a translation can say the opposite thing and stay green. `.github/workflows/claude-review.yml` reads for that on each pull request and comments inline. It reviews rather than gates, and no finding of its blocks a merge. The action refuses to run when the workflow file differs from the copy on `main`, so a pull request cannot rewrite its own reviewer, at the cost that a change to the reviewer itself goes unreviewed until it lands.

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

`meters` accepts the old spellings `egress` and `calls` as aliases for `bytes` and `units`; the repository translates them, so research written against the earlier names still lands correctly. Everything else is enforced: the build fails if the slug collides or is not URL-safe, the source is not an AWS-controlled domain, the prose quotes a dollar amount or runs long, or the checked date is missing.

Use `node scripts/merge-services.mjs batch.json` to fold a research batch into the right per-category files without duplicating a slug across two of them.

## Adding a locale

Add it to `LANGS` in `src/i18n/strings.ts`, fill in the string bundle, and create `src/pages/<lang>/`. Three other places also hold the locale list and need updating: the sitemap config in `astro.config.mjs`, `LANGS` in `scripts/check-build.mjs`, and the `og:locale` mapping in `src/layouts/Base.astro`. A test asserts every locale carries the same key set. Pages that exist in only one language grey out in the language switcher rather than linking to a 404.
