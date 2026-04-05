# 01 — Workspace Setup

This document tells Claude Code exactly how to scaffold the Nx monorepo from zero.
Run these commands in order. Do not skip steps.

---

## 1. Create Nx Workspace

```bash
pnpm dlx create-nx-workspace@latest listenroom \
  --preset=empty \
  --packageManager=pnpm \
  --nxCloud=skip
cd listenroom
```

---

## 2. Install Nx Plugins

```bash
pnpm add -D @nx/next @nx/nest @nx/js
```

---

## 3. Generate the Next.js Frontend

```bash
pnpm nx g @nx/next:app web \
  --directory=apps/web \
  --style=tailwind \
  --appRouter=true \
  --src=false \
  --e2eTestRunner=none \
  --unitTestRunner=none
```

---

## 4. Generate the NestJS Backend

```bash
pnpm nx g @nx/nest:app api \
  --directory=apps/api \
  --e2eTestRunner=none \
  --unitTestRunner=none
```

---

## 5. Generate the Shared Library

```bash
pnpm nx g @nx/js:lib shared \
  --directory=libs/shared \
  --bundler=tsc \
  --unitTestRunner=none \
  --publishable=false
```

---

## 6. Install Runtime Dependencies

```bash
# Backend
pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io
pnpm add @nestjs/serve-static
pnpm add uuid
pnpm add -D @types/uuid

# Frontend
pnpm add socket.io-client
```

---

## 7. Install yt-dlp on the system

yt-dlp must be installed on the host machine (not via npm).

```bash
# Linux / macOS
pip install yt-dlp

# Verify
yt-dlp --version
```

Also ensure `ffmpeg` is installed — yt-dlp uses it to merge audio streams:

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

---

## 8. Configure NestJS Port

In `apps/api/src/main.ts`, set the port to 4000:

```ts
await app.listen(4000);
```

---

## 9. Configure Next.js Proxy

In `apps/web/next.config.js`, add rewrites so the frontend can reach the backend
in development without CORS issues:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/:path*',
      },
      {
        source: '/audio/:path*',
        destination: 'http://localhost:4000/audio/:path*',
      },
    ]
  },
}

module.exports = nextConfig
```

---

## 10. Verify Everything Runs

```bash
pnpm nx run-many -t serve -p web,api --parallel
```

Frontend should be at http://localhost:3000
Backend should be at http://localhost:4000

---

## Expected Final Structure

```
listenroom/
├── apps/
│   ├── web/                  ← Next.js 14 App Router
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   └── next.config.js
│   └── api/
│       └── src/
│           ├── main.ts
│           └── app/
│               ├── app.module.ts
│               └── app.controller.ts
├── libs/
│   └── shared/
│       └── src/
│           └── index.ts      ← all shared types + socket event names
├── nx.json
├── package.json
└── tsconfig.base.json
```