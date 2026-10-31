/** Shared pure world layout: server homes and browser movement agree on dry land. */
export function random(seed = 1987) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
export function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}
export function terrainHeight(x: number, z: number) {
  const hills = 1.6 * Math.exp(-((x - 0.8) ** 2 + (z + 3.7) ** 2) / 18);
  const basin = 1.02 * Math.exp(-(((x + 2.5) / 3.5) ** 4) - ((z - 1.5) / 2.4) ** 4);
  const stream = x < -4 ? 0.85 * Math.exp(-(((z - 2.2) / 0.65) ** 2)) : 0;
  return 1.65 + hills + 0.12 * Math.sin(x * 1.3) * Math.cos(z * 0.9) - basin - stream;
}
export function coast(angle: number) {
  return 1 + 0.055 * Math.sin(angle * 5) + 0.025 * Math.cos(angle * 9 + 1);
}
export function isWalkable(x: number, z: number) {
  return (x / 9.1) ** 2 + (z / 7.1) ** 2 < 1 && terrainHeight(x, z) > 1.43 &&
    ((x - 0.3) ** 2 + (z + 3.6) ** 2 > 0.65);
}
