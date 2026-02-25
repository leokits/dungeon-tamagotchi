# Dungeon Tamagotchi - Game Design Overview

## Concept

A **multiplayer async PvP web game** that blends:

1. **What Did I Do to Deserve This, My Lord? (勇者別嚣張)** - 2D side-scrolling dungeon building/digging with ecosystem-based resource growth
2. **Tamagotchi** - Virtual pet raising with evolution via care/feeding, permanent death, stats

Players build their own dungeon, grow resources inside it, raise pets (tamagotchi-style) that live and evolve within the dungeon, then send those pets to raid other players' dungeons.

## Core Loop

```
Build Dungeon → Grow Resources → Raise Pets via Food Combos → Raid Others' Dungeons → Risk Pet Death
     ↑                                                                                      |
     └──────────────────── Loot / Captured Pets ←───────────────────────────────────────────┘
```

1. **Dig** tiles to expand your dungeon corridors
2. **Wait** for resources to regrow in soil (influenced by Dungeon Crystal energy)
3. **Hatch** eggs using Chrono Dust + resources
4. **Pets roam** your dungeon autonomously, eating resources they walk past
5. **Feed combos** trigger evolution (last 3-5 items in food log matched against evolution table)
6. **Launch raids** on other players' dungeons (async simulation, up to 3 pets per squad)
7. **Win loot** or **capture enemy pets** — but your pets can permanently die

## Tech Stack

| Layer            | Choice                                                          |
| ---------------- | --------------------------------------------------------------- |
| Frontend         | **Next.js 14 (App Router)** — SSR + API routes                 |
| 2D Game Renderer | **Phaser.js** embedded in client component                     |
| Auth             | **Supabase Auth** (Google OAuth / magic link)                   |
| Database         | **Supabase** (serverless PostgreSQL + Realtime + RLS)           |
| Server           | **Cloud Run** (min=0, max=3 instances — scales to zero)         |
| Background Jobs  | **Cloud Scheduler** → hits `/api/tick` every 5 minutes          |
| CI/CD            | GitHub → Cloud Build → Artifact Registry → Cloud Run            |

### Scale-to-Zero Requirement

This is a hobby project. Zero cost when not playing is critical:

- Cloud Run min-instances = 0 (cold starts acceptable)
- Supabase free tier for DB + Auth + Realtime
- Cloud Scheduler only triggers tick endpoint
- Resource growth uses **catch-up simulation** pattern (calculate missed ticks on next access)

## Design Documents

| Document                          | Contents                                           |
| --------------------------------- | -------------------------------------------------- |
| [01-DUNGEON.md](01-DUNGEON.md)   | Dungeon grid, tile types, crystal, resource growth  |
| [02-PETS.md](02-PETS.md)         | Pet system, hunger, evolution, death                |
| [03-RAIDS.md](03-RAIDS.md)       | Async PvP, simulation, replays, outcomes            |
| [04-DATABASE.md](04-DATABASE.md) | Full schema, tables, enums, indexes                 |
| [05-API.md](05-API.md)           | All API routes and `/api/tick` logic                |
| [06-FRONTEND.md](06-FRONTEND.md) | Phaser scenes, UI layout, client architecture       |
| [07-INFRA.md](07-INFRA.md)       | Cloud Run, Supabase, CI/CD, Dockerfile              |
| [08-PHASES.md](08-PHASES.md)     | Implementation phases and roadmap                   |
