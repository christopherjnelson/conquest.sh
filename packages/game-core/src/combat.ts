export interface CombatResult {
  attackerRolls: number[];
  defenderRolls: number[];
  attackerLosses: number;
  defenderLosses: number;
}

export type RandomNumberGenerator = () => number;

/**
 * Resolves one round of combat between attacker and defender.
 * Attacker rolls 1 to 3 dice.
 * Defender rolls 1 to 2 dice.
 * Dice are sorted descending and compared one by one.
 * Defender wins ties.
 */
export function resolveCombat(
  attackerDiceCount: number,
  defenderDiceCount: number,
  randomFn: RandomNumberGenerator = Math.random
): CombatResult {
  const clampedAttackerDice = Math.max(1, Math.min(3, attackerDiceCount));
  const clampedDefenderDice = Math.max(1, Math.min(2, defenderDiceCount));

  const rollDie = (): number => Math.floor(randomFn() * 6) + 1;

  const attackerRolls = Array.from({ length: clampedAttackerDice }, rollDie).sort((a, b) => b - a);
  const defenderRolls = Array.from({ length: clampedDefenderDice }, rollDie).sort((a, b) => b - a);

  const comparisons = Math.min(attackerRolls.length, defenderRolls.length);
  let attackerLosses = 0;
  let defenderLosses = 0;

  for (let i = 0; i < comparisons; i++) {
    if (attackerRolls[i] > defenderRolls[i]) {
      defenderLosses++;
    } else {
      attackerLosses++;
    }
  }

  return {
    attackerRolls,
    defenderRolls,
    attackerLosses,
    defenderLosses,
  };
}
