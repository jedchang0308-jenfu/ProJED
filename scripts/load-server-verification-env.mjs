import { loadServerVerificationEnv } from './release/env-boundary.mjs';

const loaded = loadServerVerificationEnv();
for (const [key, value] of Object.entries(loaded)) {
  if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
}

export { loaded as serverVerificationEnv };
