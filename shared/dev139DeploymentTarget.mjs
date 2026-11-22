// Deployment and provider bindings are app-specific even inside the shared project.
// Changing this source does not publish a provider qualification or create resources.
export const MANAGED_PROJECT_ID = 'jenfu-platform-prod';
export const MANAGED_PROJECT_NUMBER = '9536592944';
export const MANAGED_IMAGE_REPOSITORY = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/projed-release';
export const MANAGED_AUDIO_BUCKET = 'jenfu-platform-prod-projed-meeting-audio';
// Planned deterministic URL; provider readback is required before publication.
export const MANAGED_PUBLIC_ORIGIN = 'https://projed-prod-9536592944.asia-east1.run.app';
