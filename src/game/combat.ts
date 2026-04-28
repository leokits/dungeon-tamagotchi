/**
 * Turn-based combat engine for dungeon pet battles.
 *
 * Simulates combat between pets with skills, elemental affinities,
 * and stat-based damage. All exported functions are pure and
 * deterministic given the same inputs and seed.
 *
 * Elemental affinity cycle:
 *   fire > nature > crystal > shadow > fire
 *   Advantage: 1.5x, Disadvantage: 0.75x, Neutral: 1.0x
 *
 * Damage formula (extends monsters.ts calcDamage):
 *   baseDamage = atk * (atk / (atk + def)) * variance(0.85-1.15)
 *   finalDamage = max(1, floor(baseDamage * elementMultiplier * defendMultiplier * buffMultiplier))
 */

import { BASE_EXP_PER_KILL, levelGapMultiplier, MONSTER_DEF_BY_ID } from "./monsters";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type ElementType = "fire" | "nature" | "crystal" | "shadow" | "neutral";
export type SkillType = "attack" | "heal" | "buff" | "debuff" | "aoe" | "stealth";
export type CombatActionType = "attack" | "skill" | "defend" | "flee";

export interface Combatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  element: ElementType;
  skills: CombatSkill[];
  isDefending: boolean;
  isStealthed: boolean;
  buffs: StatBuff[];
  debuffs: StatBuff[];
}

export interface CombatSkill {
  id: string;
  name: string;
  type: SkillType;
  mpCost: number;
  power: number;
  element: ElementType | null;
  cooldown: number;
  currentCooldown: number;
}

export interface StatBuff {
  stat: "atk" | "def" | "spd";
  multiplier: number;
  duration: number;
}

export interface CombatAction {
  turn: number;
  actorId: string;
  action: CombatActionType;
  targetId?: string;
  skillId?: string;
  damage?: number;
  healed?: number;
  missed?: boolean;
  fled?: boolean;
}

export interface CombatResult {
  winnerId: string;
  loserId: string;
  actions: CombatAction[];
  turns: number;
  winnerHp: number;
  expGained: number;
}

export interface MultiCombatResult {
  results: CombatResult[];
  actions: CombatAction[];
}

// ═══════════════════════════════════════════════════════════════════
// SEEDED PRNG
// ═══════════════════════════════════════════════════════════════════

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /** Returns a value in [0, 1) */
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 0xffffffff;
  }

  /** Returns a value in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Pick a random element from an array */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// ═══════════════════════════════════════════════════════════════════
// ELEMENTAL AFFINITY
// ═══════════════════════════════════════════════════════════════════

/**
 * Elemental advantage cycle: fire > nature > crystal > shadow > fire
 * Advantage: 1.5x damage
 * Disadvantage: 0.75x damage
 * Neutral: 1.0x damage
 */
const ELEMENT_ADVANTAGE: Record<ElementType, ElementType> = {
  fire: "nature",
  nature: "crystal",
  crystal: "shadow",
  shadow: "fire",
  neutral: "neutral",
};

export function getElementMultiplier(
  attackerElement: ElementType,
  defenderElement: ElementType
): number {
  if (attackerElement === "neutral" || defenderElement === "neutral") {
    return 1.0;
  }

  if (ELEMENT_ADVANTAGE[attackerElement] === defenderElement) {
    return 1.5;
  }

  if (ELEMENT_ADVANTAGE[defenderElement] === attackerElement) {
    return 0.75;
  }

  return 1.0;
}

// ═══════════════════════════════════════════════════════════════════
// DAMAGE CALCULATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate the buff/debuff multiplier for a given stat.
 * Multiplies all active buffs and divides by all active debuffs.
 */
function getStatMultiplier(combatant: Combatant, stat: "atk" | "def" | "spd"): number {
  let multiplier = 1.0;

  for (const buff of combatant.buffs) {
    if (buff.stat === stat) {
      multiplier *= buff.multiplier;
    }
  }

  for (const debuff of combatant.debuffs) {
    if (debuff.stat === stat) {
      multiplier *= debuff.multiplier;
    }
  }

  return multiplier;
}

/**
 * Calculate damage from attacker to defender.
 *
 * baseDamage = atk * (atk / (atk + def)) * variance(0.85-1.15)
 * elementMultiplier = getElementMultiplier(attackerElement, defenderElement)
 * defendMultiplier = isDefending ? 0.5 : 1.0
 * buffMultiplier = applyBuffs(stat)
 * finalDamage = max(1, floor(baseDamage * elementMultiplier * defendMultiplier * buffMultiplier))
 */
export function calcDamage(
  attacker: Combatant,
  defender: Combatant,
  rng: SeededRandom
): number {
  const atkStat = attacker.atk * getStatMultiplier(attacker, "atk");
  const defStat = defender.def * getStatMultiplier(defender, "def");

  const ratio = atkStat / (atkStat + defStat);
  const baseDamage = atkStat * ratio;
  const variance = rng.range(0.85, 1.15);

  const elementMultiplier = getElementMultiplier(attacker.element, defender.element);
  const defendMultiplier = defender.isDefending ? 0.5 : 1.0;

  return Math.max(1, Math.floor(baseDamage * variance * elementMultiplier * defendMultiplier));
}

// ═══════════════════════════════════════════════════════════════════
// TURN ORDER
// ═══════════════════════════════════════════════════════════════════

/**
 * Determine turn order based on speed. Higher spd goes first.
 * Ties broken randomly using the seeded RNG.
 */
export function determineTurnOrder(
  a: Combatant,
  b: Combatant,
  rng: SeededRandom
): [Combatant, Combatant] {
  const spdA = a.spd * getStatMultiplier(a, "spd");
  const spdB = b.spd * getStatMultiplier(b, "spd");

  if (spdA > spdB) return [a, b];
  if (spdB > spdA) return [b, a];
  return rng.next() < 0.5 ? [a, b] : [b, a];
}

// ═══════════════════════════════════════════════════════════════════
// BUFF / DEBUFF MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/** Decrement buff/debuff durations and remove expired ones. */
function tickBuffs(combatant: Combatant): void {
  combatant.buffs = combatant.buffs
    .map((b) => ({ ...b, duration: b.duration - 1 }))
    .filter((b) => b.duration > 0);

  combatant.debuffs = combatant.debuffs
    .map((d) => ({ ...d, duration: d.duration - 1 }))
    .filter((d) => d.duration > 0);
}

// ═══════════════════════════════════════════════════════════════════
// SKILL EXECUTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Execute a skill and return the resulting CombatAction.
 * Mutates combatants' hp/mp/buffs/debuffs as side effects.
 */
function executeSkill(
  actor: Combatant,
  target: Combatant,
  skill: CombatSkill,
  turn: number,
  rng: SeededRandom
): CombatAction {
  actor.mp -= skill.mpCost;
  skill.currentCooldown = skill.cooldown;

  const action: CombatAction = {
    turn,
    actorId: actor.id,
    action: "skill",
    skillId: skill.id,
    targetId: target.id,
  };

  switch (skill.type) {
    case "attack": {
      const atkStat = actor.atk * getStatMultiplier(actor, "atk");
      const defStat = target.def * getStatMultiplier(target, "def");
      const ratio = atkStat / (atkStat + defStat);
      const baseDamage = (skill.power / 100) * atkStat * ratio;
      const variance = rng.range(0.85, 1.15);
      const elementMultiplier = skill.element
        ? getElementMultiplier(skill.element, target.element)
        : 1.0;
      const defendMultiplier = target.isDefending ? 0.5 : 1.0;
      const damage = Math.max(1, Math.floor(baseDamage * variance * elementMultiplier * defendMultiplier));
      target.hp = Math.max(0, target.hp - damage);
      action.damage = damage;
      break;
    }

    case "heal": {
      const healAmount = Math.min(skill.power, actor.maxHp - actor.hp);
      actor.hp = Math.min(actor.maxHp, actor.hp + healAmount);
      action.healed = healAmount;
      action.targetId = actor.id;
      break;
    }

    case "buff": {
      const buff: StatBuff = {
        stat: skill.power <= 30 ? "atk" : skill.power <= 60 ? "def" : "spd",
        multiplier: 1.0 + skill.power / 100,
        duration: 3,
      };
      actor.buffs.push(buff);
      break;
    }

    case "debuff": {
      const debuff: StatBuff = {
        stat: skill.power <= 30 ? "atk" : skill.power <= 60 ? "def" : "spd",
        multiplier: 1.0 - skill.power / 200,
        duration: 3,
      };
      target.debuffs.push(debuff);
      action.damage = 0;
      break;
    }

    case "aoe": {
      const atkStat = actor.atk * getStatMultiplier(actor, "atk");
      const defStat = target.def * getStatMultiplier(target, "def");
      const ratio = atkStat / (atkStat + defStat);
      const baseDamage = (skill.power / 100) * atkStat * ratio;
      const variance = rng.range(0.85, 1.15);
      const elementMultiplier = skill.element
        ? getElementMultiplier(skill.element, target.element)
        : 1.0;
      const defendMultiplier = target.isDefending ? 0.5 : 1.0;
      const damage = Math.max(1, Math.floor(baseDamage * variance * elementMultiplier * defendMultiplier));
      target.hp = Math.max(0, target.hp - damage);
      action.damage = damage;
      break;
    }

    case "stealth": {
      actor.isStealthed = true;
      break;
    }
  }

  return action;
}

// ═══════════════════════════════════════════════════════════════════
// AI DECISION
// ═══════════════════════════════════════════════════════════════════

/**
 * AI decision for a combatant's action.
 *
 * Priority:
 * 1. If hp < 30% and can flee → flee
 * 2. If every 3rd turn and hp < 50% → defend
 * 3. If mp >= skill.mpCost → use strongest available skill
 * 4. Else → basic attack
 */
function decideAction(
  combatant: Combatant,
  turn: number,
  rng: SeededRandom
): { action: CombatActionType; skillId?: string } {
  const hpPercent = combatant.hp / combatant.maxHp;

  if (hpPercent < 0.3) {
    return { action: "flee" };
  }

  if (turn % 3 === 0 && hpPercent < 0.5) {
    return { action: "defend" };
  }

  const availableSkills = combatant.skills.filter(
    (s) => s.currentCooldown === 0 && combatant.mp >= s.mpCost
  );

  if (availableSkills.length > 0) {
    availableSkills.sort((a, b) => b.power - a.power);
    return { action: "skill", skillId: availableSkills[0].id };
  }

  return { action: "attack" };
}

// ═══════════════════════════════════════════════════════════════════
// COMBAT SIMULATION (1v1)
// ═══════════════════════════════════════════════════════════════════

/**
 * Simulate a 1v1 turn-based combat between two combatants.
 *
 * Each turn: both combatants act (faster goes first).
 * Combat ends when one combatant's hp <= 0, someone flees, or max turns reached.
 * If max turns: higher hp percentage wins.
 *
 * @param attacker - First combatant (attacker side)
 * @param defender - Second combatant (defender side)
 * @param maxTurns - Maximum number of turns before timeout (default 20)
 * @param seed - Random seed for deterministic simulation (default 42)
 */
export function simulateCombat(
  attacker: Combatant,
  defender: Combatant,
  maxTurns: number = 20,
  seed: number = 42
): CombatResult {
  const rng = new SeededRandom(seed);

  const a: Combatant = JSON.parse(JSON.stringify(attacker));
  const b: Combatant = JSON.parse(JSON.stringify(defender));

  a.isDefending = false;
  a.isStealthed = false;
  a.buffs = [];
  a.debuffs = [];
  b.isDefending = false;
  b.isStealthed = false;
  b.buffs = [];
  b.debuffs = [];

  for (const skill of a.skills) skill.currentCooldown = 0;
  for (const skill of b.skills) skill.currentCooldown = 0;

  const actions: CombatAction[] = [];

  for (let turn = 1; turn <= maxTurns; turn++) {
    a.isDefending = false;
    b.isDefending = false;

    const [first, second] = determineTurnOrder(a, b, rng);

    for (const actor of [first, second]) {
      const target = actor === a ? b : a;

      if (target.isStealthed) {
        target.isStealthed = false;
        actions.push({
          turn,
          actorId: actor.id,
          action: "attack",
          targetId: target.id,
          missed: true,
        });
        continue;
      }

      const decision = decideAction(actor, turn, rng);

      if (decision.action === "flee") {
        actions.push({
          turn,
          actorId: actor.id,
          action: "flee",
          fled: true,
        });
        return {
          winnerId: target.id,
          loserId: actor.id,
          actions,
          turns: turn,
          winnerHp: target.hp,
          expGained: calcExpGained(1, 1),
        };
      }

      if (decision.action === "defend") {
        actor.isDefending = true;
        actions.push({
          turn,
          actorId: actor.id,
          action: "defend",
        });
        continue;
      }

      if (decision.action === "skill" && decision.skillId) {
        const skill = actor.skills.find((s) => s.id === decision.skillId);
        if (skill) {
          const action = executeSkill(actor, target, skill, turn, rng);
          actions.push(action);

          if (target.hp <= 0) {
            return {
              winnerId: actor.id,
              loserId: target.id,
              actions,
              turns: turn,
              winnerHp: actor.hp,
              expGained: calcExpGained(1, 1),
            };
          }
          continue;
        }
      }

      const damage = calcDamage(actor, target, rng);
      target.hp = Math.max(0, target.hp - damage);
      actions.push({
        turn,
        actorId: actor.id,
        action: "attack",
        targetId: target.id,
        damage,
      });

      if (target.hp <= 0) {
        return {
          winnerId: actor.id,
          loserId: target.id,
          actions,
          turns: turn,
          winnerHp: actor.hp,
          expGained: calcExpGained(1, 1),
        };
      }
    }

    tickBuffs(a);
    tickBuffs(b);

    for (const skill of a.skills) {
      if (skill.currentCooldown > 0) skill.currentCooldown--;
    }
    for (const skill of b.skills) {
      if (skill.currentCooldown > 0) skill.currentCooldown--;
    }
  }

  const aPercent = a.hp / a.maxHp;
  const bPercent = b.hp / b.maxHp;

  if (aPercent >= bPercent) {
    return {
      winnerId: a.id,
      loserId: b.id,
      actions,
      turns: maxTurns,
      winnerHp: a.hp,
      expGained: calcExpGained(1, 1),
    };
  } else {
    return {
      winnerId: b.id,
      loserId: a.id,
      actions,
      turns: maxTurns,
      winnerHp: b.hp,
      expGained: calcExpGained(1, 1),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// MULTI-PET COMBAT (2v2, 3v3)
// ═══════════════════════════════════════════════════════════════════

/**
 * Find the weakest (lowest hp) enemy from a list.
 */
function findWeakestTarget(enemies: Combatant[]): Combatant {
  return enemies.reduce((weakest, enemy) =>
    enemy.hp < weakest.hp ? enemy : weakest
  );
}

/**
 * Simulate multi-pet combat (2v2, 3v3, etc.).
 *
 * Pets target the weakest enemy. AoE skills hit all enemies.
 * Combat ends when one side is fully defeated.
 *
 * @param attackers - Array of attacking side combatants
 * @param defenders - Array of defending side combatants
 * @param maxTurns - Maximum number of turns (default 30)
 * @param seed - Random seed for deterministic simulation (default 42)
 */
export function simulateMultiCombat(
  attackers: Combatant[],
  defenders: Combatant[],
  maxTurns: number = 30,
  seed: number = 42
): MultiCombatResult {
  const rng = new SeededRandom(seed);

  const teamA: Combatant[] = JSON.parse(JSON.stringify(attackers));
  const teamB: Combatant[] = JSON.parse(JSON.stringify(defenders));

  for (const c of [...teamA, ...teamB]) {
    c.isDefending = false;
    c.isStealthed = false;
    c.buffs = [];
    c.debuffs = [];
    for (const skill of c.skills) skill.currentCooldown = 0;
  }

  const actions: CombatAction[] = [];
  const results: CombatResult[] = [];

  for (let turn = 1; turn <= maxTurns; turn++) {
    for (const c of [...teamA, ...teamB]) {
      c.isDefending = false;
    }

    const aliveA = teamA.filter((c) => c.hp > 0);
    const aliveB = teamB.filter((c) => c.hp > 0);

    if (aliveA.length === 0 || aliveB.length === 0) break;

    const allAlive = [...aliveA, ...aliveB];
    allAlive.sort((a, b) => {
      const spdA = a.spd * getStatMultiplier(a, "spd");
      const spdB = b.spd * getStatMultiplier(b, "spd");
      if (spdA !== spdB) return spdB - spdA;
      return rng.next() < 0.5 ? -1 : 1;
    });

    for (const actor of allAlive) {
      if (actor.hp <= 0) continue;

      const isTeamA = teamA.some((c) => c.id === actor.id);
      const enemies = isTeamA
        ? teamB.filter((c) => c.hp > 0)
        : teamA.filter((c) => c.hp > 0);

      if (enemies.length === 0) break;

      const stealthedEnemy = enemies.find((e) => e.isStealthed);
      if (stealthedEnemy) {
        stealthedEnemy.isStealthed = false;
        actions.push({
          turn,
          actorId: actor.id,
          action: "attack",
          targetId: stealthedEnemy.id,
          missed: true,
        });
        continue;
      }

      const decision = decideAction(actor, turn, rng);

      if (decision.action === "flee") {
        actor.hp = 0;
        actions.push({
          turn,
          actorId: actor.id,
          action: "flee",
          fled: true,
        });
        continue;
      }

      if (decision.action === "defend") {
        actor.isDefending = true;
        actions.push({
          turn,
          actorId: actor.id,
          action: "defend",
        });
        continue;
      }

      if (decision.action === "skill" && decision.skillId) {
        const skill = actor.skills.find((s) => s.id === decision.skillId);
        if (skill) {
          if (skill.type === "aoe") {
            actor.mp -= skill.mpCost;
            skill.currentCooldown = skill.cooldown;

            const atkStat = actor.atk * getStatMultiplier(actor, "atk");
            const variance = rng.range(0.85, 1.15);
            const elementMultiplier = skill.element
              ? getElementMultiplier(skill.element, enemies[0].element)
              : 1.0;

            for (const enemy of enemies) {
              const defStat = enemy.def * getStatMultiplier(enemy, "def");
              const ratio = atkStat / (atkStat + defStat);
              const baseDamage = (skill.power / 100) * atkStat * ratio;
              const defendMultiplier = enemy.isDefending ? 0.5 : 1.0;
              const damage = Math.max(
                1,
                Math.floor(baseDamage * variance * elementMultiplier * defendMultiplier)
              );
              enemy.hp = Math.max(0, enemy.hp - damage);
              actions.push({
                turn,
                actorId: actor.id,
                action: "skill",
                skillId: skill.id,
                targetId: enemy.id,
                damage,
              });
            }
          } else {
            const target = findWeakestTarget(enemies);
            const action = executeSkill(actor, target, skill, turn, rng);
            actions.push(action);
          }

          const remainingEnemies = isTeamA
            ? teamB.filter((c) => c.hp > 0)
            : teamA.filter((c) => c.hp > 0);
          if (remainingEnemies.length === 0) break;
          continue;
        }
      }

      const target = findWeakestTarget(enemies);
      const damage = calcDamage(actor, target, rng);
      target.hp = Math.max(0, target.hp - damage);
      actions.push({
        turn,
        actorId: actor.id,
        action: "attack",
        targetId: target.id,
        damage,
      });
    }

    for (const c of [...teamA, ...teamB]) {
      if (c.hp > 0) {
        tickBuffs(c);
        for (const skill of c.skills) {
          if (skill.currentCooldown > 0) skill.currentCooldown--;
        }
      }
    }

    const aliveAEnd = teamA.filter((c) => c.hp > 0);
    const aliveBEnd = teamB.filter((c) => c.hp > 0);

    if (aliveAEnd.length === 0 || aliveBEnd.length === 0) break;
  }

  const aliveAFinal = teamA.filter((c) => c.hp > 0);
  const aliveBFinal = teamB.filter((c) => c.hp > 0);

  if (aliveAFinal.length > 0 && aliveBFinal.length === 0) {
    for (const winner of aliveAFinal) {
      results.push({
        winnerId: winner.id,
        loserId: teamB[0].id,
        actions: [],
        turns: actions.length > 0 ? actions[actions.length - 1].turn : 0,
        winnerHp: winner.hp,
        expGained: calcExpGained(1, 1),
      });
    }
  } else if (aliveBFinal.length > 0 && aliveAFinal.length === 0) {
    for (const winner of aliveBFinal) {
      results.push({
        winnerId: winner.id,
        loserId: teamA[0].id,
        actions: [],
        turns: actions.length > 0 ? actions[actions.length - 1].turn : 0,
        winnerHp: winner.hp,
        expGained: calcExpGained(1, 1),
      });
    }
  } else {
    const totalHpA = aliveAFinal.reduce((sum, c) => sum + c.hp / c.maxHp, 0);
    const totalHpB = aliveBFinal.reduce((sum, c) => sum + c.hp / c.maxHp, 0);

    if (totalHpA >= totalHpB) {
      for (const winner of aliveAFinal) {
        results.push({
          winnerId: winner.id,
          loserId: teamB[0].id,
          actions: [],
          turns: actions.length > 0 ? actions[actions.length - 1].turn : 0,
          winnerHp: winner.hp,
          expGained: calcExpGained(1, 1),
        });
      }
    } else {
      for (const winner of aliveBFinal) {
        results.push({
          winnerId: winner.id,
          loserId: teamA[0].id,
          actions: [],
          turns: actions.length > 0 ? actions[actions.length - 1].turn : 0,
          winnerHp: winner.hp,
          expGained: calcExpGained(1, 1),
        });
      }
    }
  }

  return { results, actions };
}

// ═══════════════════════════════════════════════════════════════════
// EXP CALCULATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate EXP gained from combat.
 *
 * Uses the level gap multiplier from monsters.ts:
 * - Killing higher level = more exp (up to 3x)
 * - Killing same level = baseExp
 * - Killing much lower level = minimal exp (as low as 0.02x)
 *
 * @param winnerLevel - Level of the winning pet
 * @param loserLevel - Level of the losing pet
 * @param baseExp - Base EXP per kill (default 20, matches BASE_EXP_PER_KILL)
 */
export function calcExpGained(
  winnerLevel: number,
  loserLevel: number,
  baseExp: number = BASE_EXP_PER_KILL
): number {
  const multiplier = levelGapMultiplier(winnerLevel, loserLevel);
  return Math.max(1, Math.floor(baseExp * multiplier));
}

// ═══════════════════════════════════════════════════════════════════
// COMBATANT FACTORY
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a Combatant from a MonsterDef and level.
 * Useful for quickly setting up combat from monster definitions.
 */
export function createCombatantFromMonster(
  monsterId: string,
  level: number,
  element: ElementType = "neutral"
): Combatant {
  const def = MONSTER_DEF_BY_ID[monsterId];
  if (!def) {
    throw new Error(`Monster not found: ${monsterId}`);
  }

  const hp = def.baseStats.hp + def.growth.hp * (level - 1);
  const mp = def.baseStats.mp + def.growth.mp * (level - 1);
  const atk = def.baseStats.atk + def.growth.atk * (level - 1);
  const defStat = def.baseStats.def + def.growth.def * (level - 1);
  const spd = def.baseStats.spd + def.growth.spd * (level - 1);

  return {
    id: `${monsterId}_lv${level}`,
    name: def.name,
    hp,
    maxHp: hp,
    mp,
    maxMp: mp,
    atk,
    def: defStat,
    spd,
    element,
    skills: [],
    isDefending: false,
    isStealthed: false,
    buffs: [],
    debuffs: [],
  };
}