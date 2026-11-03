import { z } from 'zod';

import { logger } from '../../utils/logger.js';
import { routingModel } from './models.js';
import { quickRoute } from './quick-route.js';
import { type RouteInput, routeWithFallback } from './route-policy.js';
import { buildRouterPrompt } from './router-prompt.js';

const routeSchema = z.object({
  route: z.enum(['documents', 'general']),
  standaloneQuery: z.string().min(1).max(4_000).nullable(),
});

const router = routingModel.withStructuredOutput(routeSchema, { method: 'jsonSchema' });

export const routeQuestion = (input: RouteInput) => {
  const decision = quickRoute(input);
  if (decision) return Promise.resolve(decision);
  return routeWithFallback(
    input,
    async (signal) => {
      const result = await router.invoke(buildRouterPrompt(input), { signal });
      return { route: result.route, standaloneQuery: result.standaloneQuery ?? input.content };
    },
    (error) => {
      logger.warn({ err: error }, 'Routing unavailable; using document retrieval');
    },
  );
};
