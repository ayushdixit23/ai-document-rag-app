import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { DocumentChip } from '@/components/chats/document-chip';
import type { ProcessingProgress } from '@/lib/documents/types';

void test('document status distinguishes preparation, actual section progress, provider waits, and saving', () => {
  const render = (
    stage: ProcessingProgress['stage'],
    status: 'processing' | 'ready' = 'processing',
  ) =>
    renderToStaticMarkup(
      createElement(DocumentChip, {
        name: 'report.pdf',
        size: 100,
        status,
        progress: { stage, completed: 48, total: 162 },
      }),
    );
  assert.match(render('embedding'), /Preparing 48\/162 sections…/u);
  assert.match(render('waiting'), /Preparing 48\/162 sections · waiting for next batch…/u);
  assert.match(render('saving'), /Finishing…/u);
  assert.match(render('embedding'), /role="status"/u);
  assert.doesNotMatch(render('embedding', 'ready'), /Preparing 48\/162 sections…/u);
});
