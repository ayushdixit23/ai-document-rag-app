import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PgDialect } from 'drizzle-orm/pg-core';

import { selectEvidence } from './evidence.js';
import { localRerank } from './local-rerank.js';
import { fuseRanks } from './rank-fusion.js';
import { candidate } from './retrieval.fixtures.js';
import { lexicalRetrievalQuery, retrievalQuery } from './retrieval-query.js';
import { searchCandidates, type SearchDependencies } from './search-candidates.js';
import { lexicalQueryText } from './search-terms.js';

void test('fusion rewards agreement, keeps branch scores, and deterministically deduplicates IDs', () => {
  const first = candidate('a');
  const both = candidate('b');
  const ranked = fuseRanks([first, both, both], [both, candidate('c')]);
  assert.deepEqual(
    ranked.map((item) => item.chunkId),
    ['b', 'a', 'c'],
  );
  assert.equal(ranked[0]?.fusionScore, 1 / 62 + 1 / 61);
  assert.equal(ranked[0].vectorRank, 2);
  assert.equal(ranked[0].lexicalRank, 1);
  assert.equal(ranked[0].lexicalScore, both.score);
  assert.equal(fuseRanks([first], [candidate('c')])[0]?.chunkId, 'a');
});

void test('lexical query preserves codes and phrases and avoids AND-matching question glue', () => {
  const text = lexicalQueryText('What does "annual revenue" say about ERR-500 in 2026?');
  assert.match(text, /"annual revenue"/u);
  assert.match(text, /"err-500"/u);
  assert.match(text, / OR /u);
  assert.doesNotMatch(text, /"what"|"does"/u);
  assert.equal(lexicalQueryText('the and what?'), '');
  assert.match(lexicalQueryText('हिंदी राजस्व'), /राजस्व/u);
});

void test('both SQL branches bind input and enforce owner, document scope, and readiness', () => {
  const scope = { userId: 'owner', documentIds: ['selected'] };
  for (const statement of [
    retrievalQuery(scope.userId, scope.documentIds, [1, 2]),
    lexicalRetrievalQuery(scope, "Robert'); DROP TABLE document; --"),
  ]) {
    const { sql, params } = new PgDialect().sqlToQuery(statement);
    assert.match(sql, /"document_chunk"\."user_id" = \$/u);
    assert.match(sql, /"document"\."user_id" = \$/u);
    assert.match(sql, /"document"\."status" = 'ready'/u);
    assert.match(sql, /jsonb_array_elements_text/u);
    assert.ok(params.includes('["selected"]'));
    assert.doesNotMatch(sql, /DROP TABLE/u);
    assert.equal(params.at(-1), 20);
  }
});

void test('either search branch can fail; complete failure remains explicit', async () => {
  const failure = () => Promise.reject(new Error('Unavailable'));
  const success = () => Promise.resolve([candidate('ok')]);
  for (const failed of ['vector', 'lexical'] as const) {
    const reported: string[] = [];
    const dependencies: SearchDependencies = {
      vector: success,
      lexical: success,
      mode: 'hybrid',
      report: (branch) => {
        reported.push(branch);
      },
      [failed]: failure,
    };
    const results = await searchCandidates('revenue', new AbortController().signal, dependencies);
    assert.equal(results[0]?.chunkId, 'ok');
    assert.deepEqual(reported, [failed]);
    await assert.rejects(
      searchCandidates('revenue', new AbortController().signal, {
        ...dependencies,
        vector: failure,
        lexical: failure,
      }),
      /unavailable/u,
    );
  }
});

void test('search branches start together and cancellation discards late results', async () => {
  const controller = new AbortController();
  const started: string[] = [];
  const waiting = (branch: string) => () => {
    started.push(branch);
    return new Promise<never>(() => {});
  };
  const work = searchCandidates('revenue', controller.signal, {
    vector: waiting('vector'),
    lexical: waiting('lexical'),
    mode: 'hybrid',
    report: () => {},
  });
  assert.deepEqual(started, ['vector', 'lexical']);
  controller.abort(new Error('Disconnected'));
  await assert.rejects(work, /Disconnected/u);
});

void test('local BM25 promotes literal evidence and preserves semantic order without term matches', () => {
  const items = [
    candidate('generic', 'General information.'),
    candidate('specific', 'Code ERR-500: retry later.'),
  ];
  assert.equal(localRerank('What is ERR-500?', items)[0]?.chunkId, 'specific');
  assert.deepEqual(localRerank('unrelated', items), items);
  assert.deepEqual(localRerank('the and', items), items);
});

void test('evidence respects budget, keeps cross-page support, and renumbers after duplicate removal', () => {
  const a = candidate('a');
  const duplicate = candidate('duplicate');
  const otherPage = { ...candidate('page2'), metadata: { page: 2 } };
  const sources = selectEvidence([a, duplicate, otherPage]);
  assert.deepEqual(
    sources.map((source) => [source.chunkId, source.n]),
    [
      ['a', 1],
      ['page2', 2],
    ],
  );
  assert.deepEqual(selectEvidence([a], 1), []);
  assert.equal(
    selectEvidence(
      Array.from({ length: 15 }, (_, index) =>
        candidate(String(index), `Different passage ${String(index)}`),
      ),
    ).length,
    8,
  );
});
