import { registerCleanupWorker } from '../documents/cleanup.worker.js';
import { registerIngestWorker } from './ingest/ingest.worker.js';
import { registerSummaryWorker } from './summary/summary.worker.js';

export const registerRagWorkers = async (): Promise<void> => {
  await registerIngestWorker();
  await registerSummaryWorker();
  await registerCleanupWorker();
};
