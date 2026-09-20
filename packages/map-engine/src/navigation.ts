/** Cycles authored territory order without depending on a built-in map. */
export function getNextTabTerritoryId(
  territoryIds: readonly string[],
  currentId: string | null,
  reverse = false
): string | null {
  if (territoryIds.length === 0) return null;
  const current = currentId === null ? -1 : territoryIds.indexOf(currentId);
  if (current < 0) return reverse ? territoryIds[territoryIds.length - 1] : territoryIds[0];
  const step = reverse ? -1 : 1;
  return territoryIds[(current + step + territoryIds.length) % territoryIds.length];
}
