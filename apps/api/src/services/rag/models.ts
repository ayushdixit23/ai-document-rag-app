import { ChatGoogle } from '@langchain/google';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

import {
  GEMINI_API_KEY,
  GEMINI_CHAT_MODEL,
  GEMINI_EMBED_MODEL,
  GEMINI_FAST_MODEL,
} from '../../config/env.js';
import { EMBEDDING_DIMENSIONS } from './config.js';
import { lowLatencyThinking } from './model-options.js';

const MAX_RETRIES = 3;

export const chatModel = new ChatGoogle({
  model: GEMINI_CHAT_MODEL,
  apiKey: GEMINI_API_KEY,
  maxRetries: MAX_RETRIES,
});

export const fastModel = new ChatGoogle({
  model: GEMINI_FAST_MODEL,
  apiKey: GEMINI_API_KEY,
  maxRetries: MAX_RETRIES,
  ...lowLatencyThinking(GEMINI_FAST_MODEL),
});

// Routing and naming must never inherit lengthy provider retry/backoff cycles.
export const routingModel = new ChatGoogle({
  model: GEMINI_FAST_MODEL,
  apiKey: GEMINI_API_KEY,
  maxRetries: 0,
  maxOutputTokens: 512,
  ...lowLatencyThinking(GEMINI_FAST_MODEL),
});

export const embeddings = new GoogleGenerativeAIEmbeddings({
  model: GEMINI_EMBED_MODEL,
  apiKey: GEMINI_API_KEY,
  outputDimensionality: EMBEDDING_DIMENSIONS,
  maxRetries: MAX_RETRIES,
});
