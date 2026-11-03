import type { ProcessingProgress } from '@/lib/documents/types';

export function processingLabel(progress: ProcessingProgress | null | undefined): string {
  if (!progress) return 'Preparing…';
  if (progress.stage === 'saving') return 'Finishing…';
  if (progress.stage === 'waiting')
    return `Preparing ${String(progress.completed)}/${String(progress.total)} sections · waiting for next batch…`;
  return `Preparing ${String(progress.completed)}/${String(progress.total)} sections…`;
}
