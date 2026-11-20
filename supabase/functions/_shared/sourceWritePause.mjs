// Unset is the pre-cutover default. A malformed configured value must not
// silently reopen the old source.
export function legacyWritesPaused() {
  const mode = Deno.env.get('PROJED_LEGACY_WRITE_MODE');
  return mode !== undefined && mode !== 'open';
}

export function sourcePausedResponse(headers = {}) {
  return Response.json({ error: {
    code: 'PROJED_SOURCE_WRITE_PAUSED', message: 'ProJED 正在移轉資料，請於恢復後重試。',
  } }, {
    status: 503,
    headers: { ...headers, 'Cache-Control': 'no-store' },
  });
}
