# Task 2 Report — Brainstorm + Auto-Select Module

## What was implemented

- `src/brainstorm.ts` — new module exporting a `brainstorm()` function that:
  1. Classifies a topic into one of the persona's content pillars via keyword scoring
  2. Generates 3 variants using `PostGenerator.generateVariants()`
  3. Asks the LLM (via `PostGenerator.chat()`) to pick the best variant
  4. Returns the winning `GeneratePostResult`

- `src/generation/postGenerator.ts` — added a public `chat()` method that delegates to `this.client.chat()`, so consumers no longer need bracket-access workarounds for the private `client` property.

## Files created / modified

| File | Action |
|------|--------|
| `src/brainstorm.ts` | Created |
| `src/generation/postGenerator.ts` | Modified — added `chat()` method after `generateVariants` |

## Self-review findings

- The `chat()` wrapper uses a narrower `role` union (`"system" | "user" | "assistant"`) matching `NvidiaClient`'s internal `ChatMessage` type, avoiding a cast and keeping type safety.
- All calls in `brainstorm.ts` use `generator.chat(...)` instead of `generator["client"].chat(...)`.
- `classifyPillar()` falls back to the first pillar if no keywords match (score stays at 0).
- TypeScript compiles clean with `npx tsc --noEmit`.

## Issues / concerns

None.

## Fixes applied (round 2)

- **Critical 2:** Added `variants.length < 3` guard after `generateVariants` call
- **Critical 3:** Added LLM disambiguation fallback in `brainstorm()` when keyword score is 0 — `classifyPillar` now returns `{ id, score }` instead of just `id`
- **Important 4:** Wrapped `generator.chat()` for picking variants in try-catch with descriptive error message
- **Important 6:** Added empty `contentPillars` guard at top of `classifyPillar`

All four issues verified fixed. `npx tsc --noEmit` passes clean (no output).
