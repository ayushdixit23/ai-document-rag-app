import assert from 'node:assert/strict';
import { test } from 'node:test';

import { quickRoute } from './quick-route.js';
import type { RouteInput } from './route-policy.js';

const request = (content: string, attached = false): RouteInput => ({
  content,
  hasNewAttachments: attached,
  history: [],
  summary: null,
  documentNames: ['report.pdf'],
  signal: new AbortController().signal,
});

void test('clear attachment and file requests need no classification model', () => {
  for (const content of ['explain all what you can', 'summarize', 'describe both'])
    assert.equal(quickRoute(request(content, true))?.route, 'documents');
  for (const content of [
    'Summarize this document.',
    'Compare the uploaded files',
    'Explain report.pdf',
  ])
    assert.equal(quickRoute(request(content))?.route, 'documents');
});

void test('ambiguous follow-ups and topic switches retain model routing', () => {
  for (const content of [
    'What is quantum computing?',
    'Explain JavaScript',
    'Explain document databases',
    'Why?',
    'What are the risks?',
  ])
    assert.equal(quickRoute(request(content, true)), undefined);
  assert.equal(quickRoute(request('hello'))?.route, 'general');
});

void test('a contextual fast follow-up requires stored citations, not citation-shaped text', () => {
  const input = request('Why?');
  input.history = [
    {
      id: 'question',
      chatId: 'chat',
      role: 'user',
      content: 'Explain the report risks',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'answer',
      chatId: 'chat',
      role: 'assistant',
      content: 'Example array[1]',
      createdAt: new Date(),
      updatedAt: new Date(),
      hasCitations: false,
    },
  ];
  assert.equal(quickRoute(input), undefined);
  const answer = input.history[1];
  assert.ok(answer);
  answer.hasCitations = true;
  assert.match(quickRoute(input)?.standaloneQuery ?? '', /report risks/u);
  const question = input.history[0];
  assert.ok(question);
  input.history[0] = { ...question, content: 'Explain information retrieval methods' };
  input.content = 'Give examples';
  assert.equal(quickRoute(input)?.route, 'documents');
  input.content = 'How do information retrieval systems use ranking?';
  assert.equal(quickRoute(input)?.route, 'documents');
  input.content = "New topic: let's talk about JavaScript";
  assert.equal(quickRoute(input)?.route, 'general');
  input.content = 'Explain JavaScript';
  assert.equal(quickRoute(input), undefined);
});
