/** Gemini 3 uses levels; Flash 2.5 uses a token budget. */
export const lowLatencyThinking = (model: string) => {
  if (model.startsWith('gemini-3'))
    return { thinkingLevel: model.includes('pro') ? ('low' as const) : ('minimal' as const) };
  if (model.startsWith('gemini-2.5') && !model.includes('pro')) return { thinkingBudget: 0 };
  return {};
};
