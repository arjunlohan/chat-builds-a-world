/** Bedrock's strict grammar subset. Semantic constraints remain in the local validators. */
export function strictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictSchema);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const omitted = new Set(["$schema", "$id", "title", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "uniqueItems"]);
  const hints = [...omitted].filter(k => !k.startsWith("$") && k !== "title" && k in source).map(k => `${k}: ${source[k]}`).join(", ");
  const result: Record<string, unknown> = Object.fromEntries(Object.entries(source).filter(([key]) => !omitted.has(key)).map(([key, item]) => [key, ["properties", "$defs"].includes(key) ? Object.fromEntries(Object.entries(item as Record<string,unknown>).map(([name, rule]) => [name, strictSchema(rule)])) : strictSchema(item)]));
  if (hints) result.description = [source.description, hints].filter(Boolean).join("; ");
  return result;
}
