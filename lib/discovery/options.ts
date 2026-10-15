import type {
  AgePreference,
  AvoidId,
  Complexity,
  Ending,
  FeedbackReason,
  GenreId,
  GoalId,
  Intensity,
  MoodId,
  Pace,
  ReadingLength,
} from "@/types/preferences";

/**
 * The words readers see. Shared by the discovery UI and the recommendation engine,
 * so explanations always quote the exact option the reader picked.
 */

export type MoodAccent = "lamp" | "oxblood" | "moss" | "midnight" | "heather" | "ember";

export const MOOD_ACCENT_VAR: Record<MoodAccent, string> = {
  lamp: "var(--lamp)",
  oxblood: "var(--oxblood)",
  moss: "var(--moss)",
  midnight: "var(--midnight)",
  heather: "var(--heather)",
  ember: "var(--ember)",
};

export interface MoodOption {
  id: MoodId;
  emoji: string;
  title: string;
  blurb: string;
  /** Lower-case phrase used inside sentences: "You wanted something that makes you think". */
  phrase: string;
  accent: MoodAccent;
}

export const MOODS: MoodOption[] = [
  { id: "think", emoji: "🧠", title: "Make me think", blurb: "Ideas that linger: philosophy, psychology, science, society.", phrase: "something that makes you think", accent: "midnight" },
  { id: "escape", emoji: "🌌", title: "Escape reality", blurb: "Other worlds, magic, far futures and long journeys.", phrase: "to escape reality", accent: "heather" },
  { id: "emotional", emoji: "❤️", title: "Something emotional", blurb: "Character-driven stories of love, grief and becoming.", phrase: "something emotional", accent: "oxblood" },
  { id: "hooked", emoji: "🔥", title: "Keep me hooked", blurb: "Thrillers, mysteries and crime you can't put down.", phrase: "to be kept hooked", accent: "ember" },
  { id: "uncomfortable", emoji: "💀", title: "Make me uncomfortable", blurb: "Psychological horror, disturbing fiction, dark corners.", phrase: "to be made uncomfortable", accent: "oxblood" },
  { id: "grow", emoji: "🌱", title: "Help me grow", blurb: "Self-development, psychology, philosophy, better work.", phrase: "to grow", accent: "moss" },
  { id: "cozy", emoji: "😌", title: "Something cozy", blurb: "Comfort reads, small towns, found family, warm endings.", phrase: "something cozy", accent: "lamp" },
  { id: "learn", emoji: "🔬", title: "Teach me something", blurb: "History, science, economics, technology, lives well told.", phrase: "to learn something", accent: "moss" },
];

export interface GenreOption {
  id: GenreId;
  label: string;
}

export const FICTION_GENRE_OPTIONS: GenreOption[] = [
  { id: "fantasy", label: "Fantasy" },
  { id: "science-fiction", label: "Science Fiction" },
  { id: "mystery", label: "Mystery" },
  { id: "thriller", label: "Thriller" },
  { id: "horror", label: "Horror" },
  { id: "romance", label: "Romance" },
  { id: "historical-fiction", label: "Historical Fiction" },
  { id: "literary-fiction", label: "Literary Fiction" },
  { id: "adventure", label: "Adventure" },
  { id: "dystopian", label: "Dystopian" },
  { id: "crime", label: "Crime" },
  { id: "young-adult", label: "Young Adult" },
  { id: "contemporary", label: "Contemporary" },
];

export const NONFICTION_GENRE_OPTIONS: GenreOption[] = [
  { id: "psychology", label: "Psychology" },
  { id: "philosophy", label: "Philosophy" },
  { id: "business", label: "Business" },
  { id: "technology", label: "Technology" },
  { id: "science", label: "Science" },
  { id: "history", label: "History" },
  { id: "biography", label: "Biography" },
  { id: "self-help", label: "Self-help" },
  { id: "economics", label: "Economics" },
  { id: "productivity", label: "Productivity" },
  { id: "memoir", label: "Memoir" },
];

export const GENRE_LABEL: Record<GenreId, string> = Object.fromEntries(
  [...FICTION_GENRE_OPTIONS, ...NONFICTION_GENRE_OPTIONS].map((g) => [g.id, g.label]),
) as Record<GenreId, string>;

export interface LengthOption {
  id: ReadingLength;
  emoji: string;
  title: string;
  detail: string;
  /** "You wanted a quick read" */
  phrase: string;
  min: number;
  max: number;
  /** Relative spine thickness for the visual selector. */
  thickness: number;
}

export const LENGTHS: LengthOption[] = [
  { id: "quick", emoji: "⚡", title: "Quick", detail: "Under 200 pages", phrase: "a quick read", min: 0, max: 200, thickness: 1 },
  { id: "standard", emoji: "📖", title: "Standard", detail: "200 to 350 pages", phrase: "a standard-length read", min: 200, max: 350, thickness: 2 },
  { id: "long", emoji: "🌙", title: "Long read", detail: "350 to 500 pages", phrase: "a long read", min: 350, max: 500, thickness: 3 },
  { id: "huge", emoji: "🏔️", title: "Give me something huge", detail: "500+ pages", phrase: "something huge", min: 500, max: 5000, thickness: 4.4 },
];

export interface ScaleOption<T extends string> {
  id: T;
  label: string;
  target: number;
}

export const COMPLEXITY: ScaleOption<Complexity>[] = [
  { id: "easy", label: "Easy and accessible", target: 0.15 },
  { id: "moderate", label: "Moderate", target: 0.45 },
  { id: "challenging", label: "Challenging", target: 0.72 },
  { id: "very-challenging", label: "Very challenging", target: 0.92 },
];

export const PACE: ScaleOption<Pace>[] = [
  { id: "slow", label: "Slow and atmospheric", target: 0.15 },
  { id: "balanced", label: "Balanced", target: 0.5 },
  { id: "fast", label: "Fast-paced", target: 0.78 },
  { id: "addictive", label: "Extremely addictive", target: 0.95 },
];

export const INTENSITY: ScaleOption<Intensity>[] = [
  { id: "light", label: "Light", target: 0.1 },
  { id: "moderate", label: "Moderate", target: 0.4 },
  { id: "emotional", label: "Emotional", target: 0.72 },
  { id: "devastating", label: "Devastating", target: 0.95 },
];

export const ENDINGS: ScaleOption<Ending>[] = [
  { id: "happy", label: "Happy", target: 0.1 },
  { id: "hopeful", label: "Hopeful", target: 0.3 },
  { id: "bittersweet", label: "Bittersweet", target: 0.55 },
  { id: "dark", label: "Dark", target: 0.9 },
  { id: "any", label: "Doesn't matter", target: -1 },
];

export const AGES: ScaleOption<AgePreference>[] = [
  { id: "ya", label: "YA", target: 0 },
  { id: "adult", label: "Adult", target: 1 },
  { id: "any", label: "Doesn't matter", target: -1 },
];

export interface AvoidOption {
  id: AvoidId;
  label: string;
}

export const AVOIDS: AvoidOption[] = [
  { id: "too-slow", label: "Too slow" },
  { id: "depressing", label: "Too depressing" },
  { id: "romance", label: "Romance" },
  { id: "violence", label: "Violence" },
  { id: "horror", label: "Horror" },
  { id: "complicated", label: "Complicated writing" },
  { id: "long", label: "Long books" },
  { id: "self-help", label: "Self-help" },
  { id: "business", label: "Business books" },
  { id: "dense-philosophy", label: "Dense philosophy" },
  { id: "sad-endings", label: "Sad endings" },
  { id: "explicit", label: "Explicit content" },
];

export interface GoalOption {
  id: GoalId;
  label: string;
  phrase: string;
}

export const GOALS: GoalOption[] = [
  { id: "perspective", label: "A new perspective", phrase: "a new perspective" },
  { id: "knowledge", label: "Knowledge", phrase: "knowledge" },
  { id: "motivation", label: "Motivation", phrase: "motivation" },
  { id: "emotional", label: "An emotional experience", phrase: "an emotional experience" },
  { id: "entertainment", label: "Entertainment", phrase: "pure entertainment" },
  { id: "inspiration", label: "Inspiration", phrase: "inspiration" },
  { id: "people", label: "Better understanding of people", phrase: "a better understanding of people" },
  { id: "myself", label: "Better understanding of myself", phrase: "a better understanding of yourself" },
  { id: "talk", label: "Something to talk about", phrase: "something to talk about" },
  { id: "escape", label: "Escape from everyday life", phrase: "an escape from everyday life" },
  { id: "new-world", label: "A completely new world", phrase: "a completely new world" },
];

export const FEEDBACK_REASONS: Array<{ id: FeedbackReason; label: string }> = [
  { id: "too-long", label: "Too long" },
  { id: "too-slow", label: "Too slow" },
  { id: "wrong-genre", label: "Wrong genre" },
  { id: "too-dark", label: "Too dark" },
  { id: "too-emotional", label: "Too emotional" },
  { id: "subject", label: "Not interested in the subject" },
  { id: "already-read", label: "Already read it" },
  { id: "other", label: "Other" },
];

export const DISCOVERY_STEPS = [
  { id: "mood", label: "Mood" },
  { id: "genre", label: "Genre" },
  { id: "length", label: "Reading time" },
  { id: "experience", label: "Experience" },
  { id: "history", label: "History" },
  { id: "avoid", label: "Avoid" },
  { id: "goals", label: "Goals" },
  { id: "words", label: "In your words" },
] as const;

export type DiscoveryStepId = (typeof DISCOVERY_STEPS)[number]["id"];
