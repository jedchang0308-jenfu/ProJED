/** Transport qualification is separate from user identity and data cutover. */
export interface LegacyEntryBinding {
  readonly version: 'projed.legacy-entry.v1';
  readonly upstreamOrigin: 'https://projed-prod-56gnizku7q-de.a.run.app';
  readonly serviceAccount: 'projed-legacy-entry@projed-cc78d.iam.gserviceaccount.com';
  readonly serviceAccountSubject: string;
  readonly qualificationSha256: string;
}

export const LEGACY_MAIN_ORIGIN = 'https://projed-cc78d.web.app';
export const LEGACY_QUICK_ORIGIN = 'https://projed-cc78d.firebaseapp.com';
export const LEGACY_ENTRY_UPSTREAM = 'https://projed-prod-56gnizku7q-de.a.run.app';
export const LEGACY_ENTRY_ACCOUNT = 'projed-legacy-entry@projed-cc78d.iam.gserviceaccount.com';

// Approved private-candidate foundation: the dedicated SA UID and exact
// service/repository grants were read back. The source qualification is in
// config/dev-139/legacy-entry-qualification.json; this publishes no user identity,
// model, public IAM or Hosting route. Environment flags cannot replace it.
export const CURRENT_LEGACY_ENTRY_BINDING: LegacyEntryBinding | null = Object.freeze({
  version: 'projed.legacy-entry.v1', upstreamOrigin: LEGACY_ENTRY_UPSTREAM,
  serviceAccount: LEGACY_ENTRY_ACCOUNT, serviceAccountSubject: '100626728503472119855',
  qualificationSha256: 'f85613401c716c8892dc5f972a848a680261911f67f9d53c91faa0de9bec2f95',
});

export function isLegacyPublicOrigin(value: unknown): value is string {
  return value === LEGACY_MAIN_ORIGIN || value === LEGACY_QUICK_ORIGIN;
}

export function validLegacyEntryBinding(value: LegacyEntryBinding): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === 'qualificationSha256|serviceAccount|serviceAccountSubject|upstreamOrigin|version'
    && value.version === 'projed.legacy-entry.v1'
    && value.upstreamOrigin === LEGACY_ENTRY_UPSTREAM && value.serviceAccount === LEGACY_ENTRY_ACCOUNT
    && /^[1-9][0-9]{14,23}$/.test(value.serviceAccountSubject)
    && /^[a-f0-9]{64}$/.test(value.qualificationSha256);
}
