import type { AvoidId } from "@/types/preferences";
import type { TagId, WeightedTags } from "./taxonomy";

/**
 * Configurable mapping layers that sit on top of the taxonomy:
 *  - adjacency: where "exploration" candidates come from (science fiction → speculative, philosophical…)
 *  - hard-avoid thresholds: which "avoid" answers eliminate books outright
 *  - intensifiers / negations / reference patterns for free text
 * Nothing here is used by UI components.
 */

/** Adjacent concepts for intelligent discovery: never a random jump, always one step sideways. */
export const ADJACENT_TAGS: Partial<Record<TagId, WeightedTags>> = {
  scifi: { dystopian: 0.8, thoughtful: 0.7, philosophy: 0.5, ai: 0.6, literary: 0.4, satire: 0.4, timetravel: 0.5 },
  fantasy: { magic: 0.8, worldbuilding: 0.7, historical: 0.5, adventure: 0.6, gothic: 0.4, classics: 0.3 },
  mystery: { crime: 0.8, thriller: 0.7, gothic: 0.5, historical: 0.4, literary: 0.4 },
  thriller: { crime: 0.8, mystery: 0.7, dystopian: 0.4, survival: 0.5, horror: 0.3 },
  horror: { gothic: 0.9, dark: 0.8, thriller: 0.5, mystery: 0.4, literary: 0.3 },
  romance: { contemporary: 0.7, cozy: 0.6, historical: 0.5, humor: 0.5, literary: 0.4 },
  historical: { literary: 0.7, war: 0.5, biography: 0.5, classics: 0.5, family: 0.4 },
  literary: { classics: 0.7, contemporary: 0.6, historical: 0.5, philosophy: 0.4, emotional: 0.5 },
  adventure: { survival: 0.8, historical: 0.5, fantasy: 0.5, scifi: 0.4, nature: 0.5 },
  dystopian: { scifi: 0.7, politics: 0.6, society: 0.6, satire: 0.5, survival: 0.5 },
  crime: { mystery: 0.8, thriller: 0.7, dark: 0.5, literary: 0.3 },
  ya: { comingofage: 0.9, fantasy: 0.5, contemporary: 0.5, friendship: 0.5 },
  contemporary: { literary: 0.7, family: 0.6, emotional: 0.5, humor: 0.4 },
  psychology: { philosophy: 0.6, science: 0.6, selfhelp: 0.4, society: 0.5, economics: 0.3 },
  philosophy: { psychology: 0.6, spirituality: 0.5, classics: 0.5, science: 0.4, politics: 0.4 },
  business: { economics: 0.8, productivity: 0.6, biography: 0.5, technology: 0.5, psychology: 0.4 },
  technology: { science: 0.7, ai: 0.8, business: 0.4, society: 0.5, scifi: 0.3 },
  science: { nature: 0.7, technology: 0.5, history: 0.4, philosophy: 0.4, psychology: 0.4 },
  history: { biography: 0.7, politics: 0.6, war: 0.5, society: 0.5, economics: 0.4 },
  biography: { memoir: 0.9, history: 0.6, business: 0.3, science: 0.3 },
  selfhelp: { psychology: 0.8, productivity: 0.7, spirituality: 0.5, philosophy: 0.5 },
  economics: { business: 0.7, politics: 0.6, history: 0.5, psychology: 0.5, society: 0.5 },
  productivity: { selfhelp: 0.8, business: 0.6, psychology: 0.6 },
  memoir: { biography: 0.9, emotional: 0.5, literary: 0.4, history: 0.3 },
  cozy: { humor: 0.7, friendship: 0.7, romance: 0.4, mystery: 0.4, magic: 0.3 },
  dark: { gothic: 0.7, horror: 0.6, crime: 0.5, literary: 0.5, mentalhealth: 0.4 },
  thoughtful: { philosophy: 0.8, literary: 0.6, dystopian: 0.5, science: 0.4, satire: 0.4 },
  emotional: { literary: 0.7, family: 0.6, grief: 0.5, comingofage: 0.5, love: 0.4 },
};

/** "Avoid" answers that eliminate books when the association is strong. Everything else stays a soft penalty. */
/** Thresholds are on the `tagAssociation` scale: 0.9 = the genre is dominant or appears in two or more subjects. */
export const HARD_AVOID: Partial<Record<AvoidId, Array<{ tag: TagId; threshold: number }>>> = {
  romance: [
    { tag: "romance", threshold: 0.9 },
    { tag: "erotica", threshold: 0.5 },
  ],
  horror: [{ tag: "horror", threshold: 0.9 }],
  violence: [{ tag: "violence", threshold: 1 }],
  "self-help": [{ tag: "selfhelp", threshold: 0.9 }],
  business: [{ tag: "business", threshold: 0.9 }],
  explicit: [{ tag: "erotica", threshold: 0.45 }],
  "dense-philosophy": [{ tag: "philosophy", threshold: 1 }],
};

/** Words that make a free-text wish or refusal a hard one. */
export const INTENSIFIERS = /\b(absolutely|definitely|must|really|strictly|only|at all|whatsoever|can'?t stand|cannot stand|hate|zero|strongly|never)\b/;

/** "like X", "similar to X", "in the vein of X", "reminds me of X", quoted titles. */
export const REFERENCE_PATTERNS = [
  /\b(?:something|anything|books?|novels?|stories)?\s*(?:like|similar to|in the (?:vein|spirit|style) of|reminiscent of|reminds? me of|along the lines of|akin to)\s+(?:the (?:book|novel|series|show|film|movie)\s+)?([A-Z][\w'’.-]*(?:\s+(?:of|the|and|a|an|in|to|for|on|&)?\s*[A-Z][\w'’.-]*){0,5})/g,
  /[“"]([^”"]{3,60})[”"]/g,
];

/** Map a free-text clause to a reading-experience axis when it names one directly. */
export const EXPERIENCE_CUES: Array<{ re: RegExp; axis: "pace" | "complexity" | "intensity" | "darkness"; target: number }> = [
  { re: /\b(fast|fast-paced|fast paced|quick|gripping|unputdownable|page[- ]?turner|propulsive|action[- ]packed)\b/, axis: "pace", target: 0.8 },
  { re: /\b(slow|slow-burn|slow burn|meditative|leisurely|quiet|contemplative|unhurried|atmospheric)\b/, axis: "pace", target: 0.2 },
  { re: /\b(easy|light|accessible|breezy|simple|beach read|easy to read)\b/, axis: "complexity", target: 0.2 },
  { re: /\b(challenging|dense|demanding|complex|difficult|literary|ambitious|experimental)\b/, axis: "complexity", target: 0.75 },
  { re: /\b(devastating|heartbreaking|gut[- ]wrenching|tearjerker|cry|sob)\b/, axis: "intensity", target: 0.9 },
  { re: /\b(light-hearted|lighthearted|fun|feel[- ]good|uplifting|heartwarming|wholesome)\b/, axis: "intensity", target: 0.15 },
  { re: /\b(bleak|grim|dark|disturbing|harrowing|depressing|hopeless)\b/, axis: "darkness", target: 0.85 },
  { re: /\b(hopeful|happy ending|comforting|cozy|cosy|gentle)\b/, axis: "darkness", target: 0.2 },
];

/** Catalog subject phrases that explain a concept in human terms (used in "we prioritized…" sentences). */
export const CONCEPT_PHRASE: Partial<Record<TagId, string>> = {
  scifi: "ambitious science fiction",
  fantasy: "immersive fantasy",
  mystery: "a puzzle to solve",
  thriller: "relentless suspense",
  horror: "fear and dread",
  romance: "a love story at the center",
  historical: "the past brought to life",
  literary: "literary craft",
  adventure: "journeys and daring",
  dystopian: "societies gone wrong",
  crime: "crime and its consequences",
  psychology: "how minds work",
  philosophy: "big questions",
  business: "how organizations succeed",
  technology: "technology and its effects",
  science: "science explained well",
  history: "history",
  biography: "a real life, well told",
  selfhelp: "practical self-improvement",
  economics: "how money and markets work",
  productivity: "working better",
  memoir: "a life in the first person",
  thoughtful: "ideas that linger",
  emotional: "feeling deeply",
  dark: "the dark corners of people",
  cozy: "comfort and warmth",
  family: "family ties",
  war: "war and its aftermath",
  nature: "the natural world",
  spirituality: "the inner life",
  politics: "power and politics",
  society: "how societies work",
  ai: "artificial minds",
  space: "space and other worlds",
  magic: "magic",
  worldbuilding: "large-scale world-building",
  timetravel: "time travel",
  survival: "survival against the odds",
  gothic: "gothic atmosphere",
  satire: "sharp satire",
  comingofage: "growing up",
  friendship: "friendship",
  love: "love",
  grief: "grief and loss",
  mentalhealth: "mental health",
  classics: "the classics",
  humor: "humor",
};
