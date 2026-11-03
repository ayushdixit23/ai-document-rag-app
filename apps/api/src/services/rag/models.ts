import { ChatGoogle } from '@langchain/google';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

import {
  AI_MAX_OUTPUT_TOKENS,
  GEMINI_API_KEY,
  GEMINI_CHAT_MODEL,
  GEMINI_EMBED_INPUTS_PER_MINUTE,
  GEMINI_EMBED_MODEL,
  GEMINI_FAST_MODEL,
} from '../../config/env.js';
import { EMBEDDING_DIMENSIONS } from './config.js';
import { DocumentEmbeddings } from './document-embeddings.js';
import { lowLatencyThinking } from './model-options.js';

const MAX_RETRIES = 3;

export const chatModel = new ChatGoogle({
  model: GEMINI_CHAT_MODEL,
  apiKey: GEMINI_API_KEY,
  // Surface transient answer failures instead of hiding seconds of provider backoff before text.
  maxRetries: 0,
  maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
  ...lowLatencyThinking(GEMINI_CHAT_MODEL),
});

export const fastModel = new ChatGoogle({
  model: GEMINI_FAST_MODEL,
  apiKey: GEMINI_API_KEY,
  maxRetries: MAX_RETRIES,
  ...lowLatencyThinking(GEMINI_FAST_MODEL),
});

// Routing gets one bounded attempt, without provider retry/backoff cycles.
export const routingModel = new ChatGoogle({
  model: GEMINI_FAST_MODEL,
  apiKey: GEMINI_API_KEY,
  maxRetries: 0,
  maxOutputTokens: 192,
  ...lowLatencyThinking(GEMINI_FAST_MODEL),
});

export const embeddings = new DocumentEmbeddings({
  model: GEMINI_EMBED_MODEL,
  apiKey: GEMINI_API_KEY,
  outputDimensionality: EMBEDDING_DIMENSIONS,
  maxRetries: 1,
  // Two bounded batches can overlap; a single slow/retrying call must not block all uploads.
  maxConcurrency: 2,
  inputsPerMinute: GEMINI_EMBED_INPUTS_PER_MINUTE,
});

// Query failures must leave time for lexical results and reranking on the answer path.
export const queryEmbeddings = new GoogleGenerativeAIEmbeddings({
  model: GEMINI_EMBED_MODEL,
  apiKey: GEMINI_API_KEY,
  outputDimensionality: EMBEDDING_DIMENSIONS,
  maxRetries: 0,
});
