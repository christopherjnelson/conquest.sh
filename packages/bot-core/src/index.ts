import type { GameState, TerritoryState } from "@conquest/protocol";
import { suggestSets } from "@conquest/game-core";
export const BOT_PROFILE_STANDARD = Object.freeze({ id: "standard", version: 1 });
export const BOT_SIMULATION_RNG_VERSION = "mulberry32@1";
export type BotProfile = "standard";
export type BotAction = {
    type: "trade_cards";
    cardIds: [string, string, string];
} | {
    type: "deploy";
    territoryId: string;
    count: number;
} | {
    type: "attack";
    sourceTerritoryId: string;
    targetTerritoryId: string;
    dice?: number;
} | {
    type: "complete_conquest_move";
    units: number;
} | {
    type: "fortify";
    sourceTerritoryId: string;
    targetTerritoryId: string;
    units: number;
} | {
    type: "skip_phase";
} | {
    type: "end_turn";
};
export interface BotDecision {
    action: BotAction;
    reason: string;
}
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const owned = (s: GameState, p: string) => Object.values(s.territories).filter(t => t.ownerId === p).sort((a, b) => compareId(a.id, b.id));
const neighbors = (s: GameState, t: TerritoryState) => t.neighbors.map(id => s.territories[id]).filter((x): x is TerritoryState => !!x).sort((a, b) => compareId(a.id, b.id));
// Enumerate the exact Risk dice-round distribution, including defender wins ties.
function lossDistribution(ad: number, dd: number): [
    number,
    number,
    number
][] {
    const outcomes = new Map<string, number>();
    const rolls = (n: number): number[][] => {
        const out: number[][] = [];
        const walk = (dice: number[]) => {
            if (dice.length === n) {
                out.push([...dice].sort((a, b) => b - a));
                return;
            }
            for (let value = 1; value <= 6; value++)
                walk([...dice, value]);
        };
        walk([]);
        return out;
    };
    const as = rolls(ad), ds = rolls(dd), total = as.length * ds.length;
    for (const a of as)
        for (const d of ds) {
            let attackerLosses = 0, defenderLosses = 0;
            for (let i = 0; i < Math.min(ad, dd); i++) {
                if (a[i]! > d[i]!)
                    defenderLosses++;
                else
                    attackerLosses++;
            }
            const key = `${attackerLosses},${defenderLosses}`;
            outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
        }
    return [...outcomes].map(([key, count]) => {
        const [attackerLosses, defenderLosses] = key.split(",").map(Number);
        return [attackerLosses!, defenderLosses!, count / total];
    });
}
const lossDistributionCache = new Map<string, [
    number,
    number,
    number
][]>();
function getLossDistribution(attackerDice: number, defenderDice: number): [
    number,
    number,
    number
][] {
    const key = `${attackerDice}:${defenderDice}`;
    let distribution = lossDistributionCache.get(key);
    if (!distribution) {
        distribution = lossDistribution(attackerDice, defenderDice);
        lossDistributionCache.set(key, distribution);
    }
    return distribution;
}
const MAX_EXACT_ARMIES = 160;
let captureTable: Float64Array | undefined;
function getCaptureTable(): Float64Array {
    if (captureTable)
        return captureTable;
    const width = MAX_EXACT_ARMIES + 1;
    const table = new Float64Array(width * width);
    const index = (attackers: number, defenders: number) => attackers * width + defenders;
    for (let attackers = 0; attackers <= MAX_EXACT_ARMIES; attackers++)
        table[index(attackers, 0)] = attackers > 1 ? 1 : 0;
    for (let attackers = 2; attackers <= MAX_EXACT_ARMIES; attackers++) {
        for (let defenders = 1; defenders <= MAX_EXACT_ARMIES; defenders++) {
            const ad = Math.min(3, attackers - 1), dd = Math.min(2, defenders);
            let probability = 0;
            for (const [attackerLosses, defenderLosses, chance] of getLossDistribution(ad, dd)) {
                probability += chance * (defenders <= defenderLosses ? 1 : table[index(attackers - attackerLosses, defenders - defenderLosses)]!);
            }
            table[index(attackers, defenders)] = probability;
        }
    }
    captureTable = table;
    return table;
}
export function estimateCaptureProbability(attackerUnits: number, defenders: number): number {
    if (!Number.isFinite(attackerUnits) || !Number.isFinite(defenders) || !Number.isInteger(attackerUnits) || !Number.isInteger(defenders))
        return 0;
    if (defenders <= 0)
        return 1;
    if (attackerUnits <= 1)
        return 0;
    // Keep the computation bounded by scaling oversized counts into the exact table.
    // This approximation preserves force ratios and monotonicity across the table edge.
    const scale = Math.max(1, (attackerUnits - 1) / (MAX_EXACT_ARMIES - 1), defenders / MAX_EXACT_ARMIES);
    const scaledAttackers = Math.max(2, Math.min(MAX_EXACT_ARMIES, Math.round((attackerUnits - 1) / scale) + 1));
    const scaledDefenders = Math.max(1, Math.round(defenders / scale));
    const width = MAX_EXACT_ARMIES + 1;
    return getCaptureTable()[scaledAttackers * width + scaledDefenders]!;
}
function regionValue(s: GameState, target: TerritoryState, playerId: string): number {
    const sector = Object.values(s.sectors).find(x => x.territoryIds.includes(target.id));
    if (!sector)
        return 0;
    const completeBefore = sector.territoryIds.every(id => s.territories[id]?.ownerId === playerId);
    const holders = new Set(sector.territoryIds.map(id => s.territories[id]?.ownerId).filter((id): id is string => !!id && id !== playerId));
    const needed = sector.territoryIds.filter(id => s.territories[id]?.ownerId !== playerId).length;
    const bonus = Math.max(0, sector.bonusReinforcements);
    const completion = completeBefore ? 0 : bonus * (needed === 1 ? 1.8 : needed <= 3 ? .35 : .12);
    const enemyCompletedSector = holders.size === 1 && sector.territoryIds.every(id => s.territories[id]?.ownerId === target.ownerId);
    const denial = enemyCompletedSector ? bonus * .6 : 0;
    const eliminates = Object.values(s.territories).filter(t => t.ownerId === target.ownerId).length === 1 ? 2.5 : 0;
    return completion + denial + eliminates;
}
function exposed(s: GameState, t: TerritoryState, playerId: string): number {
    const threats = neighbors(s, t).filter(n => n.ownerId !== playerId).reduce((sum, n) => sum + Math.max(1, n.units - 1), 0);
    return threats ? threats / Math.max(1, t.units) : 0;
}
function reachable(s: GameState, from: string, to: string, p: string): boolean {
    const q = [from], seen = new Set(q);
    while (q.length) {
        const id = q.shift()!;
        if (id === to)
            return true;
        const t = s.territories[id];
        for (const n of t?.neighbors ?? [])
            if (!seen.has(n) && s.territories[n]?.ownerId === p) {
                seen.add(n);
                q.push(n);
            }
    }
    return false;
}
export function decideBotAction(state: Readonly<GameState>, playerId: string, _profile: BotProfile = "standard"): BotDecision | null {
    if (_profile !== "standard")
        return null;
    const active = state.players[state.activePlayerIndex];
    if (!active || active.id !== playerId || !active.isAlive || state.phase === "lobby" || state.phase === "game_over")
        return null;
    const own = owned(state as GameState, playerId);
    if (state.phase === "attack" && state.pendingConquestMove) {
        const pending = state.pendingConquestMove, source = state.territories[pending.sourceTerritoryId], target = state.territories[pending.targetTerritoryId];
        const enemyPressure = source ? neighbors(state as GameState, source).filter(n => n.ownerId !== playerId).reduce((m, n) => Math.max(m, n.units), 0) : 1;
        const targetPressure = target ? neighbors(state as GameState, target).filter(n => n.ownerId !== playerId).reduce((m, n) => Math.max(m, n.units), 0) : 0;
        const desiredSourceReserve = Math.max(1, enemyPressure);
        const sourceTransferCapacity = Math.max(0, (source?.units ?? 0) - desiredSourceReserve);
        const targetNeed = Math.max(0, targetPressure - (target?.units ?? 0));
        const transfer = Math.min(pending.maximumUnits - pending.minimumUnits, sourceTransferCapacity, targetNeed);
        return { action: { type: "complete_conquest_move", units: pending.minimumUnits + transfer }, reason: "Complete the mandatory transfer while keeping a reserve against adjacent threats." };
    }
    const hand = state.myHand ?? [];
    const forcedTrade = state.publicCards?.pendingForcedTrade?.playerId === playerId;
    const tradeSets = state.publicCards?.mode === "escalating" && hand.length >= 3
        ? suggestSets([...hand].sort((a, b) => compareId(a.id, b.id)), new Set(own.map(t => t.id)))
            .sort((a, b) => {
        const aBonus = a.some(card => card.territoryId && own.some(t => t.id === card.territoryId));
        const bBonus = b.some(card => card.territoryId && own.some(t => t.id === card.territoryId));
            if (aBonus !== bBonus) return aBonus ? -1 : 1;
            return compareId(a.map(card => card.id).sort(compareId).join(","), b.map(card => card.id).sort(compareId).join(","));
        })
        : [];
    const forcedTradeNeeded = forcedTrade && ((state.phase === "deployment" && hand.length >= 5) || (state.phase === "attack" && hand.length > 4));
    if (forcedTradeNeeded && tradeSets.length) {
        return { action: { type: "trade_cards", cardIds: tradeSets[0]!.map(card => card.id) as [string, string, string] }, reason: "Trade a valid set before continuing this forced card sequence." };
    }
    const forcedAttackDeployment = state.phase === "attack" && forcedTrade && hand.length <= 4 && state.pendingReinforcements > 0;
    if (state.phase === "deployment" && tradeSets.length) {
        return { action: { type: "trade_cards", cardIds: tradeSets[0]!.map(card => card.id) as [string, string, string] }, reason: "Trade a valid set for reinforcements before deploying." };
    }
    if (state.phase === "deployment" || forcedAttackDeployment) {
        if (state.pendingReinforcements <= 0 || !own.length)
            return null;
        const chosen = [...own].sort((a, b) => {
            const utility = (t: TerritoryState) => {
                const game = state as GameState;
                const nearby = neighbors(game, t).filter(n => n.ownerId !== playerId);
                const opportunity = nearby.reduce((best, n) => Math.max(best, estimateCaptureProbability(t.units + state.pendingReinforcements, n.units) * (1 + regionValue(game, n, playerId))), 0);
                return exposed(game, t, playerId) + opportunity * .65;
            };
            const threatDiff = utility(b) - utility(a);
            if (threatDiff)
                return threatDiff;
            const frontierA = neighbors(state as GameState, a).some(n => n.ownerId !== playerId), frontierB = neighbors(state as GameState, b).some(n => n.ownerId !== playerId);
            if (frontierA !== frontierB)
                return frontierA ? -1 : 1;
            return compareId(a.id, b.id);
        })[0];
        return { action: { type: "deploy", territoryId: chosen.id, count: state.pendingReinforcements }, reason: `Concentrate ${state.pendingReinforcements} reinforcements on the most exposed attainable frontier.` };
    }
    if (state.phase === "attack") {
        const candidates: {
            src: TerritoryState;
            target: TerritoryState;
            score: number;
            dice: number;
        }[] = [];
        for (const src of own)
            if (src.units >= 2)
                for (const target of neighbors(state as GameState, src))
                    if (target.ownerId !== playerId) {
                        const dice = Math.min(3, src.units - 1), probability = estimateCaptureProbability(src.units, target.units);
                        const value = probability * (1 + regionValue(state as GameState, target, playerId)) - (1 - probability) * .28 - exposed(state as GameState, src, playerId) * .18;
                        if (probability >= .34)
                            candidates.push({ src, target, score: value, dice });
                    }
        candidates.sort((a, b) => b.score - a.score || compareId(a.target.id, b.target.id) || compareId(a.src.id, b.src.id));
        const best = candidates[0];
        if (best && best.score > .22)
            return { action: { type: "attack", sourceTerritoryId: best.src.id, targetTerritoryId: best.target.id, dice: best.dice }, reason: `Attack ${best.target.id} with ${best.dice} dice; estimated capture chance ${Math.round(estimateCaptureProbability(best.src.units, best.target.units) * 100)}%.` };
        return { action: { type: "skip_phase" }, reason: "No adjacent attack has enough expected value; move to fortification." };
    }
    if (state.phase === "fortify") {
        let best: {
            src: TerritoryState;
            dst: TerritoryState;
            units: number;
            score: number;
        } | undefined;
        for (const src of own)
            if (src.units > 1)
                for (const dst of own)
                    if (src.id !== dst.id && reachable(state as GameState, src.id, dst.id, playerId)) {
                        const srcEnemies = neighbors(state as GameState, src).filter(n => n.ownerId !== playerId);
                        const reserve = Math.max(1, ...srcEnemies.map(n => n.units));
                        const amount = src.units - reserve;
                        if (amount <= 0)
                            continue;
                        const dstThreat = neighbors(state as GameState, dst).filter(n => n.ownerId !== playerId).reduce((x, n) => x + n.units, 0);
                        const srcThreat = srcEnemies.reduce((x, n) => x + n.units, 0);
                        const beforeSource = srcThreat / Math.max(1, src.units), afterSource = srcThreat / Math.max(1, reserve);
                        const beforeTarget = dstThreat / Math.max(1, dst.units), afterTarget = dstThreat / Math.max(1, dst.units + amount);
                        const score = (beforeTarget - afterTarget) * .8 - Math.max(0, afterSource - beforeSource) * .5;
                        if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && (src.id < best.src.id || src.id === best.src.id && dst.id < best.dst.id)))
                            best = { src, dst, units: amount, score };
                    }
        if (best && best.score > .12)
            return { action: { type: "fortify", sourceTerritoryId: best.src.id, targetTerritoryId: best.dst.id, units: best.units }, reason: `Move spare troops along owned connections to reinforce ${best.dst.id}.` };
        return { action: { type: "end_turn" }, reason: "No connected fortification improves the frontier enough; end the turn." };
    }
    return null;
}
/** Deterministic, versioned PRNG for offline simulations only. */
export function createSeededRng(seed: number): () => number {
    let value = seed >>> 0;
    return () => { value = (value + 0x6D2B79F5) >>> 0; let t = value; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
