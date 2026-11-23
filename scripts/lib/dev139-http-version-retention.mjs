import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { retainVersionHistory } from '../release/version-retention.mjs';
import { verifyPublicPredecessor } from './dev139-http-artifact.mjs';

/** Current HTTP files cannot go back to the legacy backend. Only bytes copied
 * afterwards from an authenticated predecessor may contain its old public URL.
 * This is asset compatibility, never a source writer fence or data migration. */
export function retainHttpVersionHistory({ distDir, releaseId, previousManifestPath,
  requirePreviousAssets = false, now }) {
  if (!/^[A-Za-z0-9._-]{1,96}$/.test(releaseId ?? '')) throw new Error('HTTP release identity is invalid');
  if (requirePreviousAssets && !previousManifestPath) throw new Error('Old-origin HTTP build requires its verified predecessor manifest');
  const scan = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('HTTP build asset directory cannot contain symbolic links');
      const file = join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (entry.isFile() && readFileSync(file).includes('knodlkxqpcqyrtgwpdst.supabase.co')) {
        throw new Error('Current HTTP bundle contains the legacy production Supabase origin');
      }
    }
  };
  // Run before retention; never broadly exempt app-releases or old-looking names.
  scan(distDir);
  if (previousManifestPath) {
    const { manifest: predecessor, distDir: previousDistDir } = verifyPublicPredecessor(previousManifestPath);
    // Retain the predecessor's existing policy rather than silently shortening
    // it to the default while changing the backend/entry.
    const retentionDays = predecessor.artifact?.versionRetention?.retentionDays;
    const retained = retainVersionHistory({ distDir, previousDistDir, previousVersion: `release:${predecessor.releaseId}`,
      version: `release:${releaseId}`, retentionDays, ...(now ? { now } : {}) });
    const compatibility = { sourceReleaseId: predecessor.releaseId, sourceTreeSha256: predecessor.artifact.treeSha256,
      entries: retained.copiedEntries };
    return { catalog: retained.catalog, compatibility, previousAssets: 'VERIFIED_AND_RETAINED' };
  }
  const { catalog } = retainVersionHistory({ distDir, version: `release:${releaseId}`, ...(now ? { now } : {}) });
  return { catalog, previousAssets: 'NOT_SUPPLIED_CANDIDATE_ONLY' };
}
