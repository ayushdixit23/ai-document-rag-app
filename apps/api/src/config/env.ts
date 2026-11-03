import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Validates that required environment variables are present
 * @param key - The environment variable key
 * @param defaultValue - Optional default value
 * @returns The environment variable value or default
 */
const getEnvVariable = (key: string, defaultValue: string = ''): string => {
  const value = process.env[key]?.trim() || defaultValue;

  if (!value) {
    throw new Error(`Environment variable ${key} is required but not defined`);
  }

  return value;
};

// Environment Configuration
export const PORT = getEnvVariable('PORT', '5001');
export const NODE_ENV = getEnvVariable('NODE_ENV', 'development');
export const DATABASE_URL = getEnvVariable('DATABASE_URL');
export const DATABASE_URL_DIRECT = getEnvVariable('DATABASE_URL_DIRECT', DATABASE_URL);
export const DATABASE_POOL_MAX = parseInt(getEnvVariable('DATABASE_POOL_MAX', '10'), 10);
export const DATABASE_PREPARE_STATEMENTS =
  getEnvVariable('DATABASE_PREPARE_STATEMENTS', 'false') === 'true';

// RAG integrations
export const getR2Config = () => ({
  accountId: getEnvVariable('R2_ACCOUNT_ID'),
  accessKeyId: getEnvVariable('R2_ACCESS_KEY_ID'),
  secretAccessKey: getEnvVariable('R2_SECRET_ACCESS_KEY'),
  bucketName: getEnvVariable('R2_BUCKET_NAME'),
});
export const GEMINI_API_KEY = getEnvVariable('GEMINI_API_KEY');
export const GEMINI_CHAT_MODEL = getEnvVariable('GEMINI_CHAT_MODEL', 'gemini-2.5-flash');
export const GEMINI_FAST_MODEL = getEnvVariable('GEMINI_FAST_MODEL', 'gemini-2.5-flash-lite');
export const GEMINI_EMBED_MODEL = getEnvVariable('GEMINI_EMBED_MODEL', 'gemini-embedding-2');
// Leave capacity for interactive queries under the observed 100-input free-tier allowance.
export const GEMINI_EMBED_INPUTS_PER_MINUTE = z.coerce
  .number()
  .int()
  .min(1)
  .max(100_000)
  .parse(getEnvVariable('GEMINI_EMBED_INPUTS_PER_MINUTE', '96'));
export const PINECONE_API_KEY = process.env.PINECONE_API_KEY?.trim() ?? '';
export const PINECONE_RERANK_BUDGET_SCOPE = getEnvVariable(
  'PINECONE_RERANK_BUDGET_SCOPE',
  'askdocs-bge-reranker-v2-m3',
);
export const RAG_RETRIEVAL_MODE = z
  .enum(['vector', 'hybrid', 'hybrid_rerank'])
  .parse(getEnvVariable('RAG_RETRIEVAL_MODE', 'hybrid_rerank'));

// CORS Configuration
export const ALLOWED_ORIGINS = getEnvVariable(
  'ALLOWED_ORIGINS',
  'http://localhost:3000,http://localhost:3001,http://localhost:5001',
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Better Auth
export const BETTER_AUTH_SECRET = getEnvVariable('BETTER_AUTH_SECRET');
/** Public auth URL (web origin). Auth is proxied via Next.js so cookies are first-party. */
export const BETTER_AUTH_URL = getEnvVariable('BETTER_AUTH_URL', 'http://localhost:3000');
export const WEB_URL = getEnvVariable('WEB_URL', 'http://localhost:3000');
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';

// Resend (email verification)
export const RESEND_API_KEY = getEnvVariable('RESEND_API_KEY');
export const EMAIL_FROM = getEnvVariable('EMAIL_FROM', 'AskDocs <ayush@ayushdixit.me>');

// Rate Limiting Configuration
export const RATE_LIMIT_WINDOW_MS = parseInt(getEnvVariable('RATE_LIMIT_WINDOW_MS', '900000'), 10); // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = parseInt(
  getEnvVariable('RATE_LIMIT_MAX_REQUESTS', '400'),
  10,
);

// Request timeout
export const REQUEST_TIMEOUT_MS = parseInt(getEnvVariable('REQUEST_TIMEOUT_MS', '60000'), 10);

// Health check readiness memory threshold (percent, 0-100)
export const READINESS_MEMORY_THRESHOLD = parseInt(
  getEnvVariable('READINESS_MEMORY_THRESHOLD', '90'),
  10,
);

// Security monitoring
export const SECURITY_MAX_PAYLOAD_SIZE = parseInt(
  getEnvVariable('SECURITY_MAX_PAYLOAD_SIZE', '5242880'),
  10,
); // 5MB
