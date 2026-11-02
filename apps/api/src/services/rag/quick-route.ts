import type { RouteDecision, RouteInput } from './route-policy.js';

const GENERIC_FILE_REQUEST =
  /^(?:please\s+)?(?:explain(?:\s+all)?(?:\s+what\s+you\s+can)?|summari[sz]e|describe|analy[sz]e|compare)(?:\s+(?:it|this|these|them|both|all|everything))?[.!?]*$/iu;
const FILE_REFERENCE =
  /\b(?:this|that|these|those|the|my|attached|uploaded)\s+(?:documents?|files?|pdfs?|reports?|papers?|spreadsheets?)\b/iu;
const FOLLOW_UP =
  /^(?:why|how so|tell me more|go on|continue|explain (?:it|that)|what about (?:it|that|its .+))[.!?]*$/iu;

const explicitFileRequest = (input: RouteInput) =>
  FILE_REFERENCE.test(input.content) ||
  input.documentNames.some(
    (name) => name.length > 3 && input.content.toLowerCase().includes(name.toLowerCase()),
  ) ||
  (input.hasNewAttachments &&
    (!input.content.trim() || GENERIC_FILE_REQUEST.test(input.content.trim())));

export const quickRoute = (input: RouteInput): RouteDecision | undefined => {
  const content = input.content.trim();
  if (/^(?:hi|hello|hey|thanks|thank you)[!.\s]*$/iu.test(content))
    return { route: 'general', standaloneQuery: content };
  const explicit = explicitFileRequest(input);
  const last = input.history.at(-1);
  const followUp =
    last?.role === 'assistant' && last.hasCitations === true && FOLLOW_UP.test(content);
  if (!explicit && !followUp) return undefined;
  const previous = followUp
    ? ([...input.history].reverse().find((row) => row.role === 'user')?.content ?? '')
    : '';
  return {
    route: 'documents',
    standaloneQuery: `${previous.slice(-1_000)}\n${content || 'Describe the attached documents.'}`
      .trim()
      .slice(-4_000),
  };
};
