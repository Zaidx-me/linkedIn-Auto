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

## What this doesn't do

No LinkedIn publishing. No official API calls, no browser automation. This service's job
ends at "approved post text sitting in a queue." That's intentional — publishing is a
separate concern with separate (and messier) tradeoffs.
