export function deriveCoarseTemplateFromMicro(microTemplate: string[]): string[] {
  const height = Math.floor(microTemplate.length / 2);
  const width = microTemplate[0].length;
  const coarseRows: string[] = [];

  for (let y = 0; y < height; y++) {
    let row = "";
    const top = microTemplate[2 * y];
    const bot = microTemplate[2 * y + 1];
    for (let x = 0; x < width; x++) {
      const tc = top[x];
      const bc = bot[x];
      if (tc === bc) {
        row += tc;
      } else if (tc !== "." && bc === ".") {
        row += tc;
      } else if (tc === "." && bc !== ".") {
        row += bc;
      } else {
        row += tc;
      }
    }
    coarseRows.push(row);
  }

  return coarseRows;
}
