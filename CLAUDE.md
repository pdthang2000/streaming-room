# CLAUDE.md — ListenRoom

You are building **ListenRoom**, a private, non-commercial synchronized music listening web app
for a small group of friends. One persistent room. No auth. No database. No ads.

Read ALL files in `docs/` before writing any code.
Read the guidance/rules.md folder, first line contained the latest version.md file. Read that file for better understanding of the project.
---

## Quick Reference

| Concern          | Decision                          |
|------------------|-----------------------------------|
| Monorepo         | Nx                                |
| Frontend         | Next.js 14 (App Router)           |
| Backend          | NestJS                            |
| Realtime         | Socket.io (via @nestjs/websockets)|
| Audio download   | yt-dlp (child process)            |
| Shared types     | `libs/shared`                     |
| Styling          | Tailwind CSS                      |
| Language         | TypeScript everywhere             |
| Package manager  | pnpm                              |
| Frontend port    | 3000                              |
| Backend port     | 4000                              |

---

## What This App Does

- A single persistent room that anyone can join via the URL
- Anyone can search for a song (YouTube, SoundCloud, or any yt-dlp supported source)
- Song gets downloaded as MP3 to server cache, added to queue
- Songs play one after another automatically
- A user joining mid-song hears it from the current timestamp, not from the beginning
- No play/pause/stop controls — music flows like a radio
- No login, no accounts, no database

---

## What This App Does NOT Do

- No user authentication
- No persistent storage / database
- No playback controls (no pause, no skip, no seek)
- No video — audio only
- No commercial use
- No multiple rooms (one room only, for now)

---

## Task Execution Order

When building from scratch, follow this order strictly:

1. `docs/01-setup.md` — scaffold the Nx workspace, apps, and shared lib
2. `docs/02-architecture.md` — understand the full system before writing logic
3. `docs/03-backend.md` — build NestJS modules, gateway, yt-dlp service
4. `docs/04-frontend.md` — build Next.js UI, socket connection, audio player
5. `docs/05-contracts.md` — shared types and socket event contracts (implement in `libs/shared`)

---

## Hard Rules

- NEVER use Next.js API routes for stateful logic — all state lives in NestJS
- NEVER use a database — room state is in-memory on the NestJS server
- NEVER add play/pause/stop UI controls — the queue auto-advances
- ALWAYS use the shared types from `@listenroom/shared` for socket payloads
- ALWAYS handle yt-dlp errors gracefully — show a message if a song fails to download
- ALWAYS serve audio via HTTP range requests so browsers can stream (not download) the file
- ALWAYS calculate elapsed time server-side when a client joins
- Next.js is a FRONTEND ONLY — it calls the NestJS backend, nothing else