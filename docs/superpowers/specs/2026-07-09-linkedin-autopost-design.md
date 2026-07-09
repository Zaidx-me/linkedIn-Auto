# LinkedIn Autopost — Design Spec

## Overview
Extend the existing linkedin-content-gen app to accept a topic, brainstorm/select the best post variant via NVIDIA NIM, then publish it to LinkedIn automatically using browser session automation.

## Current state
- `src/server.ts` — Express API (generate, queue, approve/reject)
- `src/cli.ts` — CLI generate helper
- `src/generation/` — NvidiaClient, PostGenerator, PostProcessor, PromptBuilder
- `src/config/persona.ts` — Voice/tone/content-pillar config
- `src/storage/postStore.ts` — SQLite CRUD with statuses (pending_review, approved, rejected, published)

## What we're adding

### Module: brainstorm + auto-select (`src/brainstorm.ts`)
- Accept a raw topic string
- Keyword-match or LLM-classify the best content pillar (from `persona.contentPillars`)
- Call `PostGenerator.generateVariants` to produce 3 variants at temps 0.6, 0.75, 0.9
- Feed all 3 variants back to the LLM with a "pick the best one" system prompt
- Save the winner to the DB with status `approved` (skips manual review)
- Return the winning post object

### Module: session management (`src/auth/session.ts`)
- `loginFirstTime()` — Opens headful Chromium via Playwright, navigates to linkedin.com/login, waits for user to complete login, captures cookies via `page.context().storageState()`, saves encrypted to `./data/session.json`
- `loadSession()` — Reads and validates saved session by visiting linkedin.com/feed headless, checks no redirect-to-login
- `ensureSession()` — Calls loadSession; if invalid, prompts re-login via loginFirstTime
- The `config` key can hold the storage path.

### Module: publisher (`src/publish/publisher.ts`)
- Takes a `GeneratePostResult` (approved post text + hashtags)
- `ensureSession()` before anything
- Open headless context with saved storage state
- Navigate to linkedin.com/feed
- Wait for "Start a post" button, click it
- Type post content with per-character delay (30-90ms random jitter)
- Wait for "Post" button, click it
- Add random pre-post browsing: scroll feed 15-40s before posting
- On CAPTCHA/verification: take screenshot, throw `captcha_blocked` error
- On success: update post status to `published`, set `publishedAt`

### Updated entry point (`npm run start -- "<topic>"`)
New script in package.json: `"start": "tsx src/auto.ts"`

`src/auto.ts`:
```
1. Parse topic from CLI args
2. brainstorm(topic) → GeneratePostResult (approved in DB)
3. publisher.publish(result) → updates status to published
4. Print summary to console
```

No server process needed for the autopost flow. The existing Express server stays for manual generation/review.

### Dependencies to add
- `playwright` (browser automation)
- `patchright` (if we go with the stealth fork — TBD, can start with raw Playwright and evaluate)

### Files to create
- `src/auth/session.ts`
- `src/publish/publisher.ts`
- `src/brainstorm.ts`
- `src/auto.ts`

### Files to update
- `package.json` — add "start" script, add playwright dep
- `src/storage/postStore.ts` — no change needed (already has `published` status)
- `src/generation/postGenerator.ts` — no change needed

## Error handling
- Session expired → re-login prompt, retry
- CAPTCHA encountered → save screenshot to `./data/captcha-{timestamp}.png`, exit with code 3, message "CAPTCHA blocked — manual intervention required"
- Network failure → retry 2x with 5s backoff, then fail
- LLM/topic failure → exit with specific code, no publish attempt

## Non-goals
- No LinkedIn API integration
- No scheduling/cron yet (can add later as `npm run schedule`)
- No multi-account support