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
  readEnv = (name) => Deno.env.get(name),
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

  throw new Error(`Missing ${source.mapEnv} or ${source.singleEnv}`);
};
