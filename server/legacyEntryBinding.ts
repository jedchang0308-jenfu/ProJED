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

// No legacy entry resource/IAM or provider-wire qualification has been approved
// and observed. An env flag cannot publish this binding.
export const CURRENT_LEGACY_ENTRY_BINDING: LegacyEntryBinding | null = null;

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
