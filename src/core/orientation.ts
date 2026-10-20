/** Display/export orientation; film geometry and editing coordinates stay unchanged. */
export const quarterTurns = (value = 0): number => ((Math.round(value) % 4) + 4) % 4;
export function rotatePoint(x: number, y: number, turns: number): { x: number; y: number } {
  switch (quarterTurns(turns)) {
    case 1: return { x: 1 - y, y: x };
    case 2: return { x: 1 - x, y: 1 - y };
    case 3: return { x: y, y: 1 - x };
    default: return { x, y };
  }
}
