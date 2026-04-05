Latest version: 1.0.0.md
# Guidance — Rules

## Purpose

This folder is a living record of how ListenRoom works at each version.
It exists for two audiences:
- **New developers** who need a deep explanation of the app logic before touching code
- **Returning developers** who want to understand what changed between versions

---

## File Naming Convention

Each version gets its own file named after the semantic version of the app:

```
guidance/
├── rules.md       ← this file, always up to date
├── 1.0.0.md       ← initial working build
├── 1.1.0.md       ← next minor version (new feature)
├── 2.0.0.md       ← major version (breaking change)
```

Use dots in the filename. Example: `1.0.0.md`

---

## What Goes in a Version File

Each version file must cover:

1. **What changed** from the previous version (skip for 1.0.0)
2. **Shared types** — every interface and constant, explained line by line
3. **Backend logic** — each service and gateway, what it owns and why
4. **Frontend logic** — each hook and component, what state it manages
5. **Data flow** — how a user action travels from browser → server → all clients
6. **Key design decisions** — why something was done a certain way

---

## When to Create a New Version File

Create a new version file when:
- A new feature is added (minor bump: `1.0.0` → `1.1.0`)
- A breaking change is made to types, events, or state shape (major bump: `1.x.x` → `2.0.0`)
- A significant bug fix changes observable behavior (patch bump: `1.0.0` → `1.0.1`)

Do NOT update an existing version file after it is published.
Each file is a snapshot — a record of how the app worked at that point in time.
