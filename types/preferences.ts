export type MoodId =
  | "think"
  | "escape"
  | "emotional"
  | "hooked"
  | "uncomfortable"
  | "grow"
  | "cozy"
  | "learn";

export type GenreId =
  | "fantasy"
  | "science-fiction"
  | "mystery"
  | "thriller"
  | "horror"
  | "romance"
  | "historical-fiction"
  | "literary-fiction"
  | "adventure"
  | "dystopian"
  | "crime"
  | "young-adult"
  | "contemporary"
  | "psychology"
  | "philosophy"
  | "business"
  | "technology"
  | "science"
  | "history"
  | "biography"
  | "self-help"
  | "economics"
  | "productivity"
  | "memoir";

export type ReadingLength = "quick" | "standard" | "long" | "huge" | "any";
export type Complexity = "easy" | "moderate" | "challenging" | "very-challenging";
export type Pace = "slow" | "balanced" | "fast" | "addictive";
export type Intensity = "light" | "moderate" | "emotional" | "devastating";
export type Ending = "happy" | "hopeful" | "bittersweet" | "dark" | "any";
export type AgePreference = "ya" | "adult" | "any";

export type AvoidId =
  | "too-slow"
  | "depressing"
  | "romance"
  | "violence"
  | "horror"
  | "complicated"
  | "long"
  | "self-help"
  | "business"
  | "dense-philosophy"
  | "sad-endings"
  | "explicit";

export type GoalId =
  | "perspective"
  | "knowledge"
  | "motivation"
  | "emotional"
  | "entertainment"
  | "inspiration"
  | "people"
  | "myself"
  | "talk"
  | "escape"
  | "new-world";

export interface LikedBook {
  id: string;
  title: string;
  authors: string[];
  coverUrl?: string;
}

export interface Preferences {
  moods: MoodId[];
  customMood: string;
  genres: GenreId[];
  /** True when the reader explicitly said genre does not matter. */
  anyGenre: boolean;
  readingLength: ReadingLength;
  complexity?: Complexity;
  pace?: Pace;
  emotionalIntensity?: Intensity;
  endingPreference?: Ending;
  agePreference?: AgePreference;
  likedBooks: LikedBook[];
  /** True when the reader said they haven't read many books yet. */
  newReader: boolean;
  dislikedThemes: AvoidId[];
  avoidText: string;
  goals: GoalId[];
  freeText: string;
}

export const EMPTY_PREFERENCES: Preferences = {
  moods: [],
  customMood: "",
  genres: [],
  anyGenre: false,
  readingLength: "any",
  likedBooks: [],
  newReader: false,
  dislikedThemes: [],
  avoidText: "",
  goals: [],
  freeText: "",
};

export type FeedbackReason =
  | "too-long"
  | "too-slow"
  | "wrong-genre"
  | "too-dark"
  | "too-emotional"
  | "subject"
  | "already-read"
  | "other";

export interface FeedbackEntry {
  bookId: string;
  reason?: FeedbackReason;
  at: number;
}
