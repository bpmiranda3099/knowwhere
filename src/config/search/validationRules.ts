import { SEARCH_LIMITS, SEARCH_VALIDATION } from './constants';

export const SEARCH_RULES = {
  queryMinLength: 1,
  queryMaxLength: SEARCH_VALIDATION.queryMaxLength,
  limitMax: SEARCH_LIMITS.max,
  venueMaxLength: SEARCH_VALIDATION.venueMaxLength,
  subjectMaxLength: SEARCH_VALIDATION.subjectMaxLength,
  sourceMaxLength: SEARCH_VALIDATION.sourceMaxLength
} as const;
