/** Structural validation keeps all constraints except the finite numbers we explicitly clamp. */
export function withoutNumericLimits(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNumericLimits);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "minimum" && key !== "maximum").map(([key, item]) => [key, withoutNumericLimits(item)]));
}
