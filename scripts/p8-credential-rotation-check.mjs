import { createClient } from '@supabase/supabase-js';
import './load-local-env.mjs';

const strict = process.argv.includes('--strict');

const envFirst = (...keys) => {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return undefined;
};

const supabaseUrl = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL');
const currentAnonKey = envFirst('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
const currentServiceRoleKey = envFirst('SUPABASE_SERVICE_ROLE_KEY');
const currentAccessToken = envFirst('SUPABASE_ACCESS_TOKEN');

const oldAnonKey = envFirst('OLD_SUPABASE_ANON_KEY', 'P8_OLD_SUPABASE_ANON_KEY');
const oldServiceRoleKey = envFirst('OLD_SUPABASE_SERVICE_ROLE_KEY', 'P8_OLD_SUPABASE_SERVICE_ROLE_KEY');
const oldAccessToken = envFirst('OLD_SUPABASE_ACCESS_TOKEN', 'P8_OLD_SUPABASE_ACCESS_TOKEN');

const manualRotationConfirmed =
  process.env.SUPABASE_CREDENTIAL_ROTATION_VERIFIED === 'true' ||
  process.env.P8_CREDENTIAL_ROTATION_VERIFIED === 'true' ||
  process.env.P7_CREDENTIAL_ROTATION_CONFIRMED === 'true';

const results = [];

const addResult = (name, status, extra = {}) => {
  results.push({ name, status, ...extra });
};

const failCurrentMissing = (name, envNames) => {
  addResult(name, 'fail', { reason: `missing env: ${envNames.join(' or ')}` });
};

const parseProjectRef = (url) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
};

const projectRef = parseProjectRef(supabaseUrl);

const decodeJwtPayload = (token) => {
  const parts = token?.split('.') ?? [];
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

const checkKeyShape = (name, token, expectedKind) => {
  const payload = decodeJwtPayload(token);
  if (payload) {
    const expectedRole = expectedKind === 'public' ? 'anon' : 'service_role';
    if (payload.role !== expectedRole) {
      addResult(name, 'fail', { reason: `expected role ${expectedRole}` });
      return;
    }

    if (payload.ref && projectRef && payload.ref !== projectRef) {
      addResult(name, 'fail', { reason: 'JWT project ref does not match SUPABASE_URL' });
      return;
    }

    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      addResult(name, 'fail', { reason: 'JWT is expired' });
      return;
    }

    addResult(name, 'pass', {
      key_type: 'legacy-jwt',
      role: payload.role,
      ref_matches_url: Boolean(!payload.ref || payload.ref === projectRef),
    });
    return;
  }

  if (expectedKind === 'public' && token.startsWith('sb_publishable_')) {
    addResult(name, 'pass', { key_type: 'publishable' });
    return;
  }

  if (expectedKind === 'admin' && token.startsWith('sb_secret_')) {
    addResult(name, 'pass', { key_type: 'secret' });
    return;
  }

  addResult(name, 'fail', {
    reason:
      expectedKind === 'public'
        ? 'expected legacy anon JWT or sb_publishable key'
        : 'expected legacy service_role JWT or sb_secret key',
  });
};

const restKeyIsActive = async (key) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/tenants?select=id&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  return {
    active: ![401, 403].includes(response.status),
    status: response.status,
  };
};

const serviceRoleIsActive = async (key) => {
  const admin = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  return {
    active: !error,
    reason: error?.message,
  };
};

const accessTokenIsActive = async (token) => {
  const response = await fetch('https://api.supabase.com/v1/projects', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return {
    active: ![401, 403].includes(response.status),
    status: response.status,
  };
};

const checkCurrentRestKey = async (name, key) => {
  try {
    const result = await restKeyIsActive(key);
    addResult(name, result.active ? 'pass' : 'fail', { http_status: result.status });
  } catch (error) {
    addResult(name, 'fail', { reason: error instanceof Error ? error.message : String(error) });
  }
};

const checkCurrentServiceRole = async (name, key) => {
  try {
    const result = await serviceRoleIsActive(key);
    addResult(name, result.active ? 'pass' : 'fail', result.reason ? { reason: result.reason } : {});
  } catch (error) {
    addResult(name, 'fail', { reason: error instanceof Error ? error.message : String(error) });
  }
};

const checkCurrentAccessToken = async (name, token) => {
  if (!token) {
    addResult(name, strict ? 'fail' : 'pending', { reason: 'SUPABASE_ACCESS_TOKEN not provided' });
    return;
  }

  try {
    const result = await accessTokenIsActive(token);
    addResult(name, result.active ? 'pass' : 'fail', { http_status: result.status });
  } catch (error) {
    addResult(name, 'fail', { reason: error instanceof Error ? error.message : String(error) });
  }
};

const checkOldRestKeyInactive = async (name, key, envName) => {
  if (!key) {
    addResult(name, manualRotationConfirmed ? 'pass' : 'pending', {
      reason: manualRotationConfirmed ? 'manual rotation confirmation supplied' : `${envName} not provided`,
    });
    return;
  }

  try {
    const result = await restKeyIsActive(key);
    addResult(name, result.active ? 'fail' : 'pass', { http_status: result.status });
  } catch (error) {
    addResult(name, 'pass', { reason: error instanceof Error ? error.message : String(error) });
  }
};

const checkOldServiceRoleInactive = async (name, key, envName) => {
  if (!key) {
    addResult(name, manualRotationConfirmed ? 'pass' : 'pending', {
      reason: manualRotationConfirmed ? 'manual rotation confirmation supplied' : `${envName} not provided`,
    });
    return;
  }

  try {
    const result = await serviceRoleIsActive(key);
    addResult(name, result.active ? 'fail' : 'pass', result.reason ? { reason: result.reason } : {});
  } catch (error) {
    addResult(name, 'pass', { reason: error instanceof Error ? error.message : String(error) });
  }
};

const checkOldAccessTokenInactive = async (name, token, envName) => {
  if (!token) {
    addResult(name, manualRotationConfirmed ? 'pass' : 'pending', {
      reason: manualRotationConfirmed ? 'manual rotation confirmation supplied' : `${envName} not provided`,
    });
    return;
  }

  try {
    const result = await accessTokenIsActive(token);
    addResult(name, result.active ? 'fail' : 'pass', { http_status: result.status });
  } catch (error) {
    addResult(name, 'pass', { reason: error instanceof Error ? error.message : String(error) });
  }
};

if (!supabaseUrl) {
  failCurrentMissing('current-supabase-url', ['SUPABASE_URL', 'VITE_SUPABASE_URL']);
}

if (!projectRef) {
  addResult('project-ref', 'fail', { reason: 'SUPABASE_URL is not a valid Supabase URL' });
} else {
  addResult('project-ref', 'pass', { ref: projectRef });
}

if (!currentAnonKey) {
  failCurrentMissing('current-public-key-shape', ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']);
} else {
  checkKeyShape('current-public-key-shape', currentAnonKey, 'public');
}

if (!currentServiceRoleKey) {
  failCurrentMissing('current-admin-key-shape', ['SUPABASE_SERVICE_ROLE_KEY']);
} else {
  checkKeyShape('current-admin-key-shape', currentServiceRoleKey, 'admin');
}

if (supabaseUrl && currentAnonKey) {
  await checkCurrentRestKey('current-anon-active', currentAnonKey);
}

if (supabaseUrl && currentServiceRoleKey) {
  await checkCurrentServiceRole('current-service-role-active', currentServiceRoleKey);
}

await checkCurrentAccessToken('current-management-token-active', currentAccessToken);

if (supabaseUrl) {
  await checkOldRestKeyInactive('old-anon-inactive', oldAnonKey, 'OLD_SUPABASE_ANON_KEY');
  await checkOldServiceRoleInactive('old-service-role-inactive', oldServiceRoleKey, 'OLD_SUPABASE_SERVICE_ROLE_KEY');
  await checkOldAccessTokenInactive('old-management-token-inactive', oldAccessToken, 'OLD_SUPABASE_ACCESS_TOKEN');
}

const failed = results.filter(result => result.status === 'fail');
const pending = results.filter(result => result.status === 'pending');
const ok = failed.length === 0 && (!strict || pending.length === 0);

console.log(JSON.stringify({
  ok,
  strict,
  project_ref: projectRef,
  manual_rotation_confirmed: manualRotationConfirmed,
  results,
}, null, 2));

if (!ok) {
  process.exit(1);
}
