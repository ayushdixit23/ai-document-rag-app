import assert from 'node:assert/strict';
import { test } from 'node:test';

import { promptTitle } from './prompt-title.js';

void test('instant titles preserve the prompt language and use filenames for upload-only chats', () => {
  assert.equal(
    promptTitle('  Explain   information retrieval. Then discuss indexing.', []),
    'Explain information retrieval.',
  );
  assert.equal(promptTitle('राजस्व के बारे में बताओ', []), 'राजस्व के बारे में बताओ');
  assert.equal(promptTitle(null, ['annual-report.pdf']), 'annual-report.pdf');
  assert.equal(promptTitle('', []), 'Documents');
  assert.ok(
    promptTitle(
      'A very long question about documents and data and search and indexing with many more words',
      [],
    ).length <= 80,
  );
});
