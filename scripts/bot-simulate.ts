import { attackTerritory, completeConquestMove, createInitialGameState, deployUnits, endTurn, fortifyUnits, projectStateFor, skipPhase, tradeCards, } from "@conquest/game-core";
import { getMap } from "@conquest/map-engine";
import { createSeededRng, decideBotAction, type BotAction } from "@conquest/bot-core";
import type { GameEvent, Player } from "@conquest/protocol";
const games = Number(process.argv[2] ?? 10);
const maxRounds = Number(process.argv[3] ?? 120);
const seed = Number(process.argv[4] ?? 721);
const cardMode = process.argv[5] ?? "escalating";
if (!Number.isSafeInteger(games) || games < 1 || games > 100 ||
    !Number.isSafeInteger(maxRounds) || maxRounds < 1 || maxRounds > 120 ||
    !Number.isSafeInteger(seed) || !["escalating", "off"].includes(cardMode)) {
    throw new Error("Usage: bun run scripts/bot-simulate.ts [games 1..100] [rounds 1..120] [integer seed] [escalating|off]");
}
const map = getMap("earth-42")!.definition;
const playersFor = (count: number): Player[] => Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Bot ${index + 1}`,
    colorIndex: index,
    colorHex: `#${(0x345678 + index * 0x12345).toString(16).slice(-6)}`,
    connected: true,
    controller: "bot",
    botProfile: "standard",
    isAlive: true,
    ready: true,
}));
const deriveSeed = (base: number, game: number, label: string) => {
    let hash = (base ^ Math.imul(game + 1, 0x9e3779b1)) >>> 0;
    for (const char of label) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};
const withoutClocks = (event: GameEvent): unknown => Object.fromEntries(Object.entries(event).filter(([key]) => !["timestamp", "startedAt", "endedAt", "durationMs"].includes(key)));
let illegal = 0;
let capped = 0;
let transcriptHash = 2166136261;
const wins: Record<string, number> = {};
const gameLatencies: number[] = [];
const decisionLatencies: number[] = [];
const addTranscript = (line: string) => {
    for (let index = 0; index < line.length; index++) {
        transcriptHash ^= line.charCodeAt(index);
        transcriptHash = Math.imul(transcriptHash, 16777619);
    }
};
for (let game = 0; game < games; game++) {
    const cycle = Math.floor(game / 5);
    const count = 2 + game % 5;
    const players = playersFor(count);
    const shuffleRng = createSeededRng(deriveSeed(seed, game, "map-shuffle@1"));
    const combatRng = createSeededRng(deriveSeed(seed, game, "combat@1"));
    const cardRng = createSeededRng(deriveSeed(seed, game, "cards@1"));
    const shuffleCards = <T,>(items: T[]): T[] => {
        const shuffled = [...items];
        for (let index = shuffled.length - 1; index > 0; index--) {
            const other = Math.floor(cardRng() * (index + 1));
            [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
        }
        return shuffled;
    };
    const shuffle = <T,>(items: T[]): T[] => {
        const shuffled = [...items];
        for (let index = shuffled.length - 1; index > 0; index--) {
            const other = Math.floor(shuffleRng() * (index + 1));
            [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
        }
        return shuffled;
    };
    let initializationShuffleCalls = 0;
    const shuffleMapAndInitialDeck = <T,>(items: T[]) =>
        initializationShuffleCalls++ === 0 ? shuffle(items) : shuffleCards(items);
    let state = createInitialGameState(`sim-${game}`, "SIM", players, map, 3, shuffleMapAndInitialDeck, cycle % count + 1, cardMode as "escalating" | "off");
    let actions = 0;
    let elapsed = 0;
    let activeTurnKey = "";
    let actionsInTurn = 0;
    const actionCap = maxRounds * count * 80;
    while (state.phase !== "game_over" && state.turnNumber <= maxRounds && actions < actionCap) {
        const player = state.players[state.activePlayerIndex];
        if (!player?.isAlive)
            break;
        const turnKey = `${state.gameId}:${state.turnNumber}:${player.id}`;
        if (turnKey !== activeTurnKey) {
            activeTurnKey = turnKey;
            actionsInTurn = 0;
        }
        const started = performance.now();
        const projected = projectStateFor(state, player.id);
        const decision = decideBotAction(projected, player.id);
        const decisionMs = performance.now() - started;
        elapsed += decisionMs;
        decisionLatencies.push(decisionMs);
        if (!decision) {
            illegal++;
            break;
        }
        let action: BotAction = decision.action;
        if (actionsInTurn >= 80) {
            if (state.pendingConquestMove) {
                action = { type: "complete_conquest_move", units: state.pendingConquestMove.minimumUnits };
            }
            else if (state.phase === "deployment") {
                const territory = Object.values(state.territories)
                    .filter((item) => item.ownerId === player.id)
                    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
                if (!territory || state.pendingReinforcements < 1) {
                    illegal++;
                    break;
                }
                action = { type: "deploy", territoryId: territory.id, count: state.pendingReinforcements };
            }
            else if (state.phase === "attack") {
                action = { type: "skip_phase" };
            }
            else if (state.phase === "fortify") {
                action = { type: "end_turn" };
            }
            else {
                illegal++;
                break;
            }
        }
        let result;
        if (action.type === "trade_cards")
            result = tradeCards(state, player.id, action.cardIds, shuffleCards);
        else if (action.type === "deploy")
            result = deployUnits(state, player.id, action.territoryId, action.count);
        else if (action.type === "attack")
            result = attackTerritory(state, player.id, action.sourceTerritoryId, action.targetTerritoryId, action.dice, combatRng);
        else if (action.type === "complete_conquest_move")
            result = completeConquestMove(state, player.id, action.units);
        else if (action.type === "fortify")
            result = fortifyUnits(state, player.id, action.sourceTerritoryId, action.targetTerritoryId, action.units);
        else if (action.type === "skip_phase")
            result = skipPhase(state, player.id, shuffleCards);
        else
            result = endTurn(state, player.id, [], shuffleCards);
        actions++;
        if (!result.ok) {
            illegal++;
            break;
        }
        const stableEvents = result.events.map(withoutClocks);
        addTranscript(`${game}:${state.turnNumber}:${player.id}:${state.phase}:${JSON.stringify(action)}:${JSON.stringify(stableEvents)}\n`);
        state = result.state;
        actionsInTurn++;
    }
    if (state.phase !== "game_over")
        capped++;
    if (state.winnerId)
        wins[state.winnerId] = (wins[state.winnerId] ?? 0) + 1;
    gameLatencies.push(elapsed / Math.max(actions, 1));
    const armies = Object.values(state.territories).map((territory) => `${territory.id}=${territory.ownerId}/${territory.units}`).sort().join(",");
    addTranscript(`${game}:${state.winnerId ?? "cap"}:${state.turnNumber}:${actions}:${armies}\n`);
}
const orderedDecisionLatencies = [...decisionLatencies].sort((a, b) => a - b);
const percentile95 = orderedDecisionLatencies[Math.max(0, Math.ceil(orderedDecisionLatencies.length * 0.95) - 1)] ?? 0;
console.log(JSON.stringify({
    seed,
    games,
    maxRounds,
    wins,
    capped,
    illegal,
    meanDecisionMs: Number((gameLatencies.reduce((sum, value) => sum + value, 0) / Math.max(1, gameLatencies.length)).toFixed(4)),
    p95DecisionMs: Number(percentile95.toFixed(4)),
    fingerprint: (transcriptHash >>> 0).toString(16).padStart(8, "0"),
    profile: "standard@1",
    rng: "mulberry32@1",
    shuffleRng: "mulberry32@1/map-shuffle@1",
    combatRng: "mulberry32@1/combat@1",
    cardMode,
    cardRng: "mulberry32@1/cards@1",
}, null, 2));
if (illegal > 0)
    process.exitCode = 1;
