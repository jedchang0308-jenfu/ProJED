import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

test('only the legacy frontend initializes Supabase even when both builds have legacy settings', async () => {
  for (const backend of ['http', 'supabase']) {
    const url = 'https://legacy.example.invalid';
    const bundle = await build({
      entryPoints: ['src/services/supabase/client.ts'], bundle: true, format: 'cjs', write: false,
      external: ['@supabase/supabase-js'],
      define: { 'import.meta.env': JSON.stringify({ VITE_DATA_BACKEND: backend, VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'fixture' }) },
    });
    const initialized: unknown[][] = [];
    const sdk = { auth: {} };
    const loaded = { exports: {} as typeof import('../../../src/services/supabase/client.js') };
    runInNewContext(bundle.outputFiles[0]!.text, {
      module: loaded,
      require(name: string) {
        assert.equal(name, '@supabase/supabase-js');
        return { createClient(...args: unknown[]) { initialized.push(args); return sdk; } };
      },
    });
    const { configuredSupabaseUrl, isSupabaseConfigured, supabase } = loaded.exports;
    if (backend === 'http') {
      assert.equal(configuredSupabaseUrl, undefined);
      assert.equal(isSupabaseConfigured, false);
      assert.throws(() => supabase.auth, { code: 'BACKEND_UNSUPPORTED' });
      assert.equal(initialized.length, 0);
    } else {
      assert.equal(configuredSupabaseUrl, url);
      assert.equal(isSupabaseConfigured, true);
      assert.equal(supabase.auth, sdk.auth);
      assert.equal(initialized.length, 1);
      assert.equal(initialized[0]?.[0], url);
    }
  }
});
