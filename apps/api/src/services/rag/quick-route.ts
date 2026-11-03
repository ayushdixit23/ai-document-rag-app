import type { RouteDecision, RouteInput } from './route-policy.js';
import { searchTerms } from './search-terms.js';

const GENERIC_FILE_REQUEST =
  /^(?:please\s+)?(?:explain(?:\s+all)?(?:\s+what\s+you\s+can)?|summari[sz]e|describe|analy[sz]e|compare)(?:\s+(?:it|this|these|them|both|all|everything))?[.!?]*$/iu;
const FILE_REFERENCE =
  /\b(?:this|that|these|those|the|my|attached|uploaded)\s+(?:documents?|files?|pdfs?|reports?|papers?|spreadsheets?)\b/iu;
const FOLLOW_UP =
  /^(?:why|how so|tell me more|go on|continue|(?:please )?(?:explain|elaborate|expand|simplify)(?: (?:it|that|more|further|in detail))?|(?:give|show)(?: me)? (?:an? )?examples?|what (?:are|about) (?:it|that|its .+))[.!?]*$/iu;
const TOPIC_SWITCH =
  /^(?:new topic|unrelated(?: question)?|forget (?:the |these |those )?(?:files?|documents?)|(?:let's|let us) (?:talk about|switch to))\b/iu;
const ROUTE_GLUE = new Set(
  'explain describe summarize summarise analyze analyse please about more details examples document documents file files report reports paper papers'.split(
    ' ',
  ),
);

const relatedFollowUp = (input: RouteInput): boolean => {
  const last = input.history.at(-1);
  if (last?.role !== 'assistant' || last.hasCitations !== true) return false;
  if (FOLLOW_UP.test(input.content.trim())) return true;
  const previous = [...input.history].reverse().find((row) => row.role === 'user')?.content ?? '';
  const topic = new Set(
    searchTerms(previous).filter((term) => term.length >= 4 && !ROUTE_GLUE.has(term)),
  );
  return searchTerms(input.content).filter((term) => topic.has(term)).length >= 2;
};

const explicitFileRequest = (input: RouteInput) =>
  FILE_REFERENCE.test(input.content) ||
  input.documentNames.some(
    (name) => name.length > 3 && input.content.toLowerCase().includes(name.toLowerCase()),
  ) ||
  (input.hasNewAttachments &&
    (!input.content.trim() || GENERIC_FILE_REQUEST.test(input.content.trim())));

export const quickRoute = (input: RouteInput): RouteDecision | undefined => {
  const content = input.content.trim();
  if (/^(?:hi|hello|hey|thanks|thank you)[!.\s]*$/iu.test(content) || TOPIC_SWITCH.test(content))
    return { route: 'general', standaloneQuery: content };
  const explicit = explicitFileRequest(input);
  const followUp = relatedFollowUp(input);
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
