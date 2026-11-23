/** Pure preparation only: no provider calls, credentials or deployment. */
export const LEGACY_ENTRY_TARGET = Object.freeze({
  project: 'projed-cc78d', site: 'projed-cc78d', region: 'asia-east1', service: 'projed-legacy-entry',
  account: 'projed-legacy-entry@projed-cc78d.iam.gserviceaccount.com',
  upstream: 'https://projed-prod-56gnizku7q-de.a.run.app',
  upstreamService: 'projects/jenfu-platform-prod/locations/asia-east1/services/projed-prod',
  publicDirectory: 'legacy-entry-public',
});

export function renderLegacyEntryHosting(baseline) {
  if (!baseline?.hosting || Array.isArray(baseline.hosting)
      || (baseline.hosting.redirects?.length ?? 0) !== 0 || baseline.hosting.i18n
      || baseline.hosting.cleanUrls !== undefined || baseline.hosting.trailingSlash !== undefined) {
    throw new Error('Legacy entry needs a reviewed single-site routing baseline');
  }
  // Existing dist would outrank rewrite and continue serving the retired app.
  // The CLI also checks this directory is empty. Root firebase.json is untouched.
  return { hosting: {
    site: LEGACY_ENTRY_TARGET.site, public: LEGACY_ENTRY_TARGET.publicDirectory, ignore: ['**'],
    headers: [{ source: '**', headers: [
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
    ] }],
    rewrites: [{ source: '**', run: { serviceId: LEGACY_ENTRY_TARGET.service, region: LEGACY_ENTRY_TARGET.region } }],
  } };
}

export function renderLegacyEntryService({ image, sourceRevision, releaseId }) {
  if (typeof image !== 'string' || !/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/projed-release\/projed-legacy-entry@sha256:[a-f0-9]{64}$/.test(image)
      || !/^[a-f0-9]{40}$/.test(sourceRevision ?? '') || !/^[a-z][a-z0-9-]{0,40}$/.test(releaseId ?? '')) {
    throw new Error('Legacy entry requires its exact immutable image and source');
  }
  return {
    name: `projects/${LEGACY_ENTRY_TARGET.project}/locations/${LEGACY_ENTRY_TARGET.region}/services/${LEGACY_ENTRY_TARGET.service}`,
    labels: { 'projed-task': 'dev-139', 'projed-source': sourceRevision, 'projed-release': releaseId },
    ingress: 'INGRESS_TRAFFIC_ALL', invokerIamDisabled: false,
    template: {
      serviceAccount: LEGACY_ENTRY_TARGET.account, executionEnvironment: 'EXECUTION_ENVIRONMENT_GEN2',
      scaling: { minInstanceCount: 0, maxInstanceCount: 1 }, maxInstanceRequestConcurrency: 2, timeout: '60s',
      containers: [{ name: 'legacy-entry', image, ports: [{ name: 'http1', containerPort: 8080 }],
        resources: { limits: { cpu: '1', memory: '256Mi' }, cpuIdle: true },
        startupProbe: { tcpSocket: { port: 8080 }, periodSeconds: 2, timeoutSeconds: 1, failureThreshold: 15 } }],
    },
  };
}
