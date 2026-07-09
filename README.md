# linkedin-content-gen

NVIDIA NIM-powered content generation service for LinkedIn posts. This is **just the
generation + approval-queue piece** — ToS-clean, no browser automation, no scraping.
Publish it yourself (copy/paste) or wire it into a separate publish module later.

## Setup

```bash
npm install
cp .env.example .env
# then edit .env and add your NVIDIA_API_KEY (get one free at https://build.nvidia.com)
```

## Run the server

```bash
npm run dev
```

Server starts on `http://localhost:4000`.

## Quick CLI usage (no server needed)

```bash
npm run generate:cli -- os-tips "Disabling NetworkManager-wait-online.service to cut boot time"
```

## API

### `GET /pillars`
Lists content pillars defined in `src/config/persona.ts`.

### `POST /generate`
```json
{
  "pillarId": "os-tips",
  "topic": "Setting up howdy facial recognition login on CachyOS",
  "extraContext": "Used with SDDM, hyprlock, and sudo. Took about 20 minutes to configure.",
  "variants": 3
}
```
Returns generated post(s), saved to the DB with status `pending_review`.

### `GET /queue`
Lists posts awaiting your review.

### `POST /queue/:id/approve`
### `POST /queue/:id/reject`

### `GET /approved`
Posts you've approved — pull from here for manual posting, or hand to a publish module.

## Editing the voice

Everything about tone, content pillars, hashtag rules, and formatting lives in
`src/config/persona.ts`. Edit that file — don't touch the prompt builder unless you're
changing prompt *structure*, not *content*.

## Swapping models

Any NVIDIA NIM-hosted open model works. Change `NVIDIA_MODEL` in `.env`. Options include:
- `meta/llama-3.1-70b-instruct`
- `meta/llama-3.3-70b-instruct`
- `nvidia/llama-3.1-nemotron-70b-instruct` (tuned more for helpfulness/instruction following)

## Autopost (browser automation)

One-command flow: brainstorm → publish → done.

### First-time setup

Playwright's automated browser gets blocked by LinkedIn. Instead, export cookies
from your real browser once:

```bash
npm run auth:login
# Prints instructions on how to export cookies from your browser.
# 1. Install "Get cookies.txt LOCALLY" Chrome extension
# 2. Go to linkedin.com, export cookies → save as data/cookies.txt
```

Then run the autopost command — it converts the cookie file automatically.

### Usage

```bash
npm run start -- "Setting up howdy facial recognition login on CachyOS"
```

This generates 3 post variants, picks the best via LLM, then publishes it to your LinkedIn feed automatically.

### If CAPTCHA appears

The tool saves a screenshot to `./data/captcha-*.png` and exits. You'll need to log in manually and re-authenticate, then re-run.

## What this doesn't do

No official LinkedIn API calls. No scheduling/cron (yet).
