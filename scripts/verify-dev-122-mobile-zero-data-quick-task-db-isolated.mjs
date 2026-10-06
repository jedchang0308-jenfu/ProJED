import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const script = resolve('scripts/verify-dev-122-mobile-zero-data-quick-task-db-isolated.ps1');
const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
