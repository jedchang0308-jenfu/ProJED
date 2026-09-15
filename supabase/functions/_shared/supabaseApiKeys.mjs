const KEY_SOURCES = Object.freeze({
  publishable: Object.freeze({
    mapEnv: "SUPABASE_PUBLISHABLE_KEYS",
    singleEnv: "SUPABASE_PUBLISHABLE_KEY",
  }),
  secret: Object.freeze({
    mapEnv: "SUPABASE_SECRET_KEYS",
    singleEnv: "SUPABASE_SECRET_KEY",
  }),
});

const present = (value) => typeof value === "string" && value.trim().length > 0;

export const resolveSupabaseFunctionKey = (
  kind,
  readEnv = (name) => globalThis.Deno?.env?.get(name),
  keyName = "default",
) => {
  const source = KEY_SOURCES[kind];
  if (!source) throw new Error(`Unsupported Supabase function key kind: ${kind}`);

  const mapValue = readEnv(source.mapEnv);
  if (present(mapValue)) {
    let parsed;
    try {
      parsed = JSON.parse(mapValue);
    } catch {
      throw new Error(`${source.mapEnv} must be a JSON object`);
    }

    const selected = parsed && !Array.isArray(parsed) ? parsed[keyName] : undefined;
    if (!present(selected)) {
      throw new Error(`${source.mapEnv} does not contain a non-empty ${keyName} key`);
    }
    return selected.trim();
  }

  const singleValue = readEnv(source.singleEnv);
  if (present(singleValue)) return singleValue.trim();

  // Supabase CLI intentionally rejects local edge-runtime secret names that
  // start with SUPABASE_. Keep the escape hatch explicit and local-only so a
  // task-owned runtime can exercise service-role readback without weakening
  // the production key contract.
  if (readEnv("DEV123_LOCAL_EDGE_RUNTIME") === "true") {
    const localValue = readEnv("DEV123_LOCAL_EDGE_SERVICE_KEY");
    if (present(localValue)) return localValue.trim();
  }

  throw new Error(`Missing ${source.mapEnv} or ${source.singleEnv}`);
};
