// Read-only identity response from the exact generated worker receiving a port.
export const createPwaWorkerVersionSource = version => {
  if (typeof version !== 'string' || !/^(?:release|build|bundle):[A-Za-z0-9][A-Za-z0-9._:-]{0,200}$/.test(version)) {
    throw new Error('Invalid generated worker version.');
  }
  return `self.addEventListener('message', event => {
  const message = event.data;
  const port = event.ports?.[0];
  if (!port || message?.type !== 'PROJED_PWA_WORKER_VERSION_V1'
    || typeof message.requestId !== 'string' || message.requestId.length > 128) return;
  port.postMessage({ type: 'PROJED_PWA_WORKER_VERSION_V1', schemaVersion: 1,
    requestId: message.requestId, version: ${JSON.stringify(version)} });
});\n`;
};
