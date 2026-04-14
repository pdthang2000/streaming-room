# CLAUDE.md — ListenRoom

You are working on **ListenRoom**, a private, non-commercial synchronized music listening web app
for a small group of friends. One persistent room. No auth. No traditional database.

**The app is already built and running.** Do not scaffold, do not re-read archived build docs.

Before writing any code, read:
- `guidance/1.0.0.md` — full description of the current codebase (types, services, hooks, deployment)
- `docs/flow.md` — all user flows and data paths
- The specific source file(s) relevant to your task

---

## Quick Reference

| Concern | Decision |
|---|---|
| Monorepo | Nx |
| Frontend | Next.js 14 (App Router, standalone output) |
| Backend | NestJS |
| Realtime | Socket.io (via `@nestjs/websockets`) |
| Audio download | yt-dlp (child process) + ffmpeg |
| Shared types | `libs/shared` → `@listenroom/shared` |
| Styling | Tailwind CSS |
| Language | TypeScript everywhere |
| Package manager | pnpm |
| Frontend port | 3000 |
| Backend port | 4000 |
| Reverse proxy | Caddy (port 80 in Docker) |
| Tunnel | cloudflared (quick Cloudflare Tunnel) |

---

## What This App Does

- A single persistent room that anyone can join via the URL
- Users pick a display name on first visit (stored in localStorage)
- Anyone can search for a song (YouTube URL, SoundCloud URL, or any yt-dlp-supported source; plain text is prefixed with `ytsearch1:` and searched on YouTube)
- Song gets downloaded as MP3 to server cache, added to the user's personal queue
- Songs play in round-robin order — the queue rotates between users so no one person monopolizes it
- A user joining mid-song hears it from the current timestamp, not from the beginning
- Users can remove songs from their own queue, reorder them (move to top / bottom)
- Only the user who added the current song can skip it
- The server persists its queue state to a snapshot file so the queue survives restarts
- In production, a Cloudflare Tunnel makes the room accessible over the public internet without port forwarding

---

## What This App Does NOT Do

- No user authentication or accounts
- No traditional database (state is in-memory + snapshot JSON file)
- No global play/pause/seek controls — music flows like a radio
- No video — audio only
- No commercial use
- No multiple rooms (one room only)
- No chat (placeholder in UI — not implemented)

---

## Hard Rules

- NEVER use Next.js API routes for stateful logic — all state lives in NestJS
- NEVER introduce a database — room state is in-memory with a JSON snapshot for persistence
- NEVER add global play/pause/stop controls — the queue auto-advances
- ALWAYS use the shared types from `@listenroom/shared` for socket payloads — never duplicate types
- ALWAYS use the `EVENTS` constants for socket event names — never hardcode strings
- ALWAYS handle yt-dlp errors gracefully — emit `downloadStatus { error }` back to the submitter only
- ALWAYS serve audio via the custom `AudioController` with HTTP range requests and `X-Accel-Buffering: no`
- ALWAYS calculate elapsed time server-side — the server clock is the single source of truth
- ALWAYS scope queue mutations (remove, reorder, skip) to the requesting user — never let one user affect another's queue
- Next.js is FRONTEND ONLY — it calls the NestJS backend, nothing else
- The socket client is a SINGLETON (`lib/socket.ts`) — never create multiple socket instances

---

## File Ownership Reference

| File / Directory | Owner | Notes |
|---|---|---|
| `libs/shared/src/index.ts` | Shared | Touch only to add new types or events |
| `apps/api/src/app/room/room.service.ts` | Backend | Round-robin queue, state, snapshots |
| `apps/api/src/app/room/room.gateway.ts` | Backend | Socket.io event handlers |
| `apps/api/src/app/queue/queue.service.ts` | Backend | yt-dlp download, meta cache, file cleanup |
| `apps/api/src/app/audio/audio.controller.ts` | Backend | HTTP range request handler |
| `apps/api/audio-cache/` | Runtime | Never commit `.mp3` files |
| `apps/api/.dev-state/` | Runtime | Never commit snapshot files |
| `apps/web/lib/socket.ts` | Frontend | Singleton socket — do not duplicate |
| `apps/web/hooks/useRoom.ts` | Frontend | Composer hook |
| `apps/web/hooks/useSocket.ts` | Frontend | Connection + joinRoom |
| `apps/web/hooks/useRoomState.ts` | Frontend | Room state + queue actions |
| `apps/web/hooks/useAudioPlayer.ts` | Frontend | Audio sync, stall recovery, autoplay |
| `apps/web/app/page.tsx` | Frontend | Single page, layout, username from localStorage |
| `apps/web/components/` | Frontend | NowPlaying, Queue, PersonalQueue, SearchBox, UsernameModal |

---

## Version History

| File | Covers |
|---|---|
| `guidance/1.0.0.md` | Current build — full codebase description |
| `docs/archived/` | Original build guides (scaffolding docs, no longer needed) |
