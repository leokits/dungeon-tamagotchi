# Frontend Architecture

## Framework

**Next.js 14 (App Router)** with TypeScript and Tailwind CSS.

Phaser.js is loaded as a client-only component (no SSR for the game canvas).

## Page Structure

```
app/
├── layout.tsx              # Root layout with auth provider
├── page.tsx                # Landing / login page
├── dashboard/
│   └── page.tsx            # Main game view (Phaser canvas + HUD)
├── raid/
│   └── [id]/
│       └── page.tsx        # Raid replay viewer
├── browse/
│   └── page.tsx            # Dungeon browser for finding raid targets
└── api/
    ├── dungeon/            # Dungeon API routes
    ├── egg/                # Egg API routes
    ├── pets/               # Pet API routes
    ├── raid/               # Raid API routes
    ├── notifications/      # Notification routes
    └── tick/               # Cloud Scheduler endpoint
```

## Phaser Integration

Phaser runs inside a React client component:

```tsx
'use client';

export default function GameCanvas() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    // Initialize Phaser only on client
    const game = new Phaser.Game(config);
    gameRef.current = game;
    return () => game.destroy(true);
  }, []);

  return <div id="phaser-game" />;
}
```

## Phaser Scenes

### DungeonScene (Main)

The primary game scene. Displays the player's dungeon.

**Features:**
- Tilemap rendering (all chunks stitched together)
- Resource sprites on tiles
- Pet sprites with simple idle/walk animations
- Dungeon Crystal with energy glow effect
- Camera pan (drag) and zoom (scroll wheel / pinch)
- Click-to-dig interaction (click solid tile → API call → re-render)
- HUD overlay:
  - Chrono Dust count
  - Crystal energy bar
  - Pet count (alive / max)
  - Expand dungeon button
  - Place hatchery button
  - Incubate egg button
  - Notification bell

**Viewport Culling:**
- Only render tiles within the camera viewport + 2-tile buffer
- Chunks outside viewport are unloaded from display list
- Tile data stays in memory; only display objects are culled

**Real-time Updates:**
- Subscribe to Supabase Realtime on `tiles` and `pets` tables
- When tick runs and updates DB, changes propagate to client automatically
- Tiles flash briefly when resources regrow
- Pets animate movement between tiles

### RaidReplayScene

Plays back a raid simulation frame by frame.

**Features:**
- Load defender's dungeon snapshot as static tilemap
- Animate attacker pets moving through dungeon
- Show HP bars above pets
- Display combat log events (damage taken, pet death, crystal reached)
- Playback controls: play, pause, speed (1x, 2x, 4x), skip to end
- End screen: result summary, loot gained, pets lost

### DungeonViewScene

Read-only view of another player's dungeon (for raid scouting).

**Features:**
- Same tilemap rendering as DungeonScene
- No interaction (no digging, no placing)
- Shows crystal position and energy
- Shows pet count
- "Launch Raid" button overlay

### DungeonBrowserScene

Could be a Phaser scene or a regular React component. Likely better as React:

**Features:**
- List of players with dungeon previews
- Filter/sort by crystal energy, pet count, dungeon size
- Click to preview dungeon (opens DungeonViewScene)
- "Raid" button per entry

## HUD / UI Components (React)

The HUD is rendered as React components **overlaid on top** of the Phaser canvas, not inside Phaser. This makes styling easier with Tailwind.

### Top Bar
- Player username
- Chrono Dust: `⏳ 42`
- Crystal Energy: progress bar with number
- Pet count: `🐾 12/20`

### Side Panel (toggleable)
- Pet list with status indicators
- Per-pet: name, sprite, stage, hunger bar, stats
- Click pet to highlight in dungeon

### Bottom Bar
- Action buttons: Dig mode, Place Hatchery, Incubate Egg, Expand Dungeon
- Currently selected tool indicator

### Notification Panel
- Bell icon with unseen count badge
- Dropdown showing recent notifications
- "Raid received", "Pet captured", "Egg hatched" etc.

## State Management

Keep it simple — no Redux or Zustand needed at this scale:

- **Supabase client** handles auth state
- **Phaser scenes** own game state (tiles, pets, resources)
- **React state** (useState/useContext) for HUD data
- **Communication** between React and Phaser via:
  - Phaser EventEmitter (game → React)
  - Direct scene method calls (React → game)

```tsx
// React → Phaser: trigger dig mode
const scene = gameRef.current?.scene.getScene('DungeonScene');
scene?.setTool('dig');

// Phaser → React: update HUD
scene.events.on('crystal-energy-changed', (energy: number) => {
  setCrystalEnergy(energy);
});
```

## Responsive Design

- Canvas fills available viewport
- HUD overlays are responsive (stack on mobile)
- Touch controls for mobile:
  - Tap to select/dig
  - Drag to pan
  - Pinch to zoom
- Minimum supported width: 360px (mobile)

## Asset Pipeline

- Sprites: pixel art style, 16x16 or 32x32 tiles
- Spritesheets loaded via Phaser's asset loader
- Placeholder colored rectangles for Phase 1 (no art needed to start)
- Asset manifest in `public/assets/`
