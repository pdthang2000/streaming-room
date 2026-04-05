# 06 — Claude Code Agent Guide

This document explains how to work with Claude Code effectively using this project.

---

## Starting from Zero

You only need these files to begin. No code yet:

```
listenroom/
├── CLAUDE.md
└── docs/
    ├── 01-setup.md
    ├── 02-architecture.md
    ├── 03-backend.md
    ├── 04-frontend.md
    ├── 05-contracts.md
    └── 06-claudecode-guide.md   ← this file
```

Start Claude Code inside this directory:

```bash
cd listenroom
claude
```

---

## First Prompt to Give Claude Code

Use this exact prompt to kick off the build:

```
Read CLAUDE.md and all files in docs/ thoroughly.
Then follow the task execution order in CLAUDE.md.
Start with docs/01-setup.md and scaffold the Nx workspace from scratch.
Ask me before proceeding past the setup step.
```

---

## Recommended Session Flow

### Session 1 — Scaffold
> "Read CLAUDE.md and docs/. Run the setup steps in docs/01-setup.md."

Let it scaffold. Verify `pnpm nx run-many -t serve -p web,api` works before continuing.

### Session 2 — Shared Lib + Backend
> "Implement the shared library from docs/05-contracts.md, then build the NestJS backend following docs/03-backend.md."

### Session 3 — Frontend
> "Build the Next.js frontend following docs/04-frontend.md. The backend is already running."

### Session 4 — Integration Testing
> "Connect the frontend to the backend. Test the full flow: search → download → play → sync on join."

---

## Useful Mid-Session Prompts

**When something breaks:**
> "Something is wrong with [X]. Re-read docs/02-architecture.md section [Y] and fix it."

**To add a feature later:**
> "I want to add [feature]. First check if it conflicts with any hard rules in CLAUDE.md, then design the approach and ask me before coding."

**To keep it on track:**
> "Review what you've built so far against docs/02-architecture.md. List any deviations."

---

## What Claude Code Will NOT Do (by design)

Based on the hard rules in CLAUDE.md, Claude Code should refuse or push back if asked to:
- Add a database
- Add user auth
- Add play/pause controls
- Use Next.js API routes for stateful logic
- Create multiple rooms

If it starts doing any of these, paste the relevant Hard Rules section from CLAUDE.md.

---

## Iterating After the First Build

Once the app is working, you can evolve it in focused sessions:

| Feature to add          | What to tell Claude Code                                      |
|-------------------------|---------------------------------------------------------------|
| Username / display name | "Add an optional display name on join, stored in socket session only" |
| Volume sync             | "Add a server-side volume level, broadcast to all on change"  |
| Song history            | "Add a `history: QueueItem[]` array to RoomState, last 20 songs" |
| Multiple rooms          | "Design a RoomManager that holds multiple named RoomService instances" |
| Docker deploy           | "Write a Dockerfile and docker-compose.yml for both apps"     |

---

## File Ownership Reference

| File/Directory                       | Owner      | Notes                              |
|--------------------------------------|------------|------------------------------------|
| `libs/shared/src/index.ts`           | Shared     | Touch only to add new types        |
| `apps/api/src/app/room/`             | Backend    | Room state + socket gateway        |
| `apps/api/src/app/queue/`            | Backend    | yt-dlp download logic              |
| `apps/api/audio-cache/`              | Runtime    | Never commit `.mp3` files          |
| `apps/web/app/page.tsx`              | Frontend   | Single page entry point            |
| `apps/web/hooks/useRoom.ts`          | Frontend   | All socket + audio logic           |
| `apps/web/components/`              | Frontend   | NowPlaying, Queue, SearchBox       |