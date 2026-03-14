/**
 * A* pathfinding for dungeon grid navigation.
 * Works on a flat tile array (as returned from the DB).
 */

export interface PathTile {
  local_x: number;
  local_y: number;
  chunk_x: number;
  chunk_y: number;
  type: string;
}

export interface GridPos {
  x: number; // global x = chunk_x * CHUNK_W + local_x
  y: number; // global y = chunk_y * CHUNK_H + local_y
}

const CHUNK_W = 20;
const CHUNK_H = 15;

function toGlobal(t: PathTile): GridPos {
  return {
    x: t.chunk_x * CHUNK_W + t.local_x,
    y: t.chunk_y * CHUNK_H + t.local_y,
  };
}

function key(x: number, y: number) {
  return `${x},${y}`;
}

const WALKABLE = new Set(["corridor", "packed", "crystal", "hatchery", "ground"]);

/**
 * Find shortest path from start to goal using A*.
 * Returns array of positions (including start and goal), or null if no path found.
 */
export function findPath(
  tiles: PathTile[],
  start: GridPos,
  goal: GridPos
): GridPos[] | null {
  // Build a lookup: key → tile type
  const tileMap = new Map<string, string>();
  for (const t of tiles) {
    const g = toGlobal(t);
    tileMap.set(key(g.x, g.y), t.type);
  }

  // Allow walking on any walkable tile, including start/goal even if crystal
  const isWalkable = (x: number, y: number) => {
    const type = tileMap.get(key(x, y));
    return type !== undefined && WALKABLE.has(type);
  };

  const goalKey = key(goal.x, goal.y);

  // Priority queue (min-heap via sorted array — good enough for dungeon sizes)
  const openSet: Array<{ pos: GridPos; f: number; g: number }> = [];
  const cameFrom = new Map<string, GridPos>();
  const gScore = new Map<string, number>();

  const startKey = key(start.x, start.y);
  gScore.set(startKey, 0);
  openSet.push({ pos: start, f: heuristic(start, goal), g: 0 });

  while (openSet.length > 0) {
    // Get node with lowest f
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    const curKey = key(current.pos.x, current.pos.y);

    if (curKey === goalKey) {
      return reconstructPath(cameFrom, current.pos);
    }

    const neighbors = [
      { x: current.pos.x - 1, y: current.pos.y },
      { x: current.pos.x + 1, y: current.pos.y },
      { x: current.pos.x, y: current.pos.y - 1 },
      { x: current.pos.x, y: current.pos.y + 1 },
    ];

    for (const neighbor of neighbors) {
      if (!isWalkable(neighbor.x, neighbor.y)) continue;

      const neighborKey = key(neighbor.x, neighbor.y);
      const tentativeG = (gScore.get(curKey) ?? Infinity) + 1;

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current.pos);
        gScore.set(neighborKey, tentativeG);
        const f = tentativeG + heuristic(neighbor, goal);
        openSet.push({ pos: neighbor, f, g: tentativeG });
      }
    }
  }

  return null; // no path found
}

function heuristic(a: GridPos, b: GridPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function reconstructPath(cameFrom: Map<string, GridPos>, current: GridPos): GridPos[] {
  const path: GridPos[] = [current];
  let cur = current;

  while (cameFrom.has(key(cur.x, cur.y))) {
    cur = cameFrom.get(key(cur.x, cur.y))!;
    path.unshift(cur);
  }

  return path;
}

/**
 * Find the dungeon entrance (ground tile adjacent to corridor, or first corridor in top chunk).
 * Returns global coordinates.
 */
export function findEntrance(tiles: PathTile[]): GridPos | null {
  // Look for ground tiles in chunk y=0 — these are the surface entrance
  const groundTiles = tiles.filter((t) => t.type === "ground" && t.chunk_y === 0);
  if (groundTiles.length > 0) {
    // Return the global position of the first ground tile
    return toGlobal(groundTiles[0]);
  }

  // Fallback: find top-most walkable tile
  const walkable = tiles.filter((t) => WALKABLE.has(t.type));
  if (walkable.length === 0) return null;

  walkable.sort((a, b) => {
    const ay = a.chunk_y * CHUNK_H + a.local_y;
    const by = b.chunk_y * CHUNK_H + b.local_y;
    return ay - by;
  });

  return toGlobal(walkable[0]);
}

/**
 * Find the crystal tile position.
 */
export function findCrystal(tiles: PathTile[]): GridPos | null {
  const crystal = tiles.find((t) => t.type === "crystal");
  if (!crystal) return null;
  return toGlobal(crystal);
}
