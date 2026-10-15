import type { AvoidId, GenreId, GoalId, MoodId } from "@/types/preferences";

/**
 * The vocabulary that connects reader language ("make me think", "cozy", "like Black Mirror")
 * to the subject headings book catalogs actually use.
 *
 * Every tag has:
 *  - patterns: matched against a book's subjects, categories, title and description
 *  - olSubjects: subject headings used to build Open Library candidate queries
 *  - kind: "genre" tags narrow a query (AND), "theme" tags broaden it (OR)
 */

export type TagId =
  | "scifi"
  | "fantasy"
  | "mystery"
  | "thriller"
  | "horror"
  | "romance"
  | "historical"
  | "literary"
  | "adventure"
  | "dystopian"
  | "crime"
  | "ya"
  | "contemporary"
  | "psychology"
  | "philosophy"
  | "business"
  | "technology"
  | "science"
  | "history"
  | "biography"
  | "selfhelp"
  | "economics"
  | "productivity"
  | "memoir"
  | "classics"
  | "humor"
  | "thoughtful"
  | "emotional"
  | "dark"
  | "cozy"
  | "family"
  | "war"
  | "nature"
  | "spirituality"
  | "politics"
  | "society"
  | "ai"
  | "space"
  | "magic"
  | "worldbuilding"
  | "timetravel"
  | "survival"
  | "gothic"
  | "satire"
  | "comingofage"
  | "children"
  | "erotica"
  | "violence"
  | "grief"
  | "love"
  | "friendship"
  | "mentalhealth";

export interface TagDef {
  label: string;
  kind: "genre" | "theme";
  /** Non-fiction topics are discounted when they show up on a novel's subject list. */
  nonfiction?: boolean;
  /** Fiction genres are discounted when they show up on a non-fiction book's subject list. */
  fiction?: boolean;
  patterns: string[];
  olSubjects: string[];
}

export const TAGS: Record<TagId, TagDef> = {
  scifi: {
    fiction: true,
    label: "science fiction",
    kind: "genre",
    patterns: ["science fiction", "sci-fi", "space opera", "cyberpunk", "life on other planets", "interplanetary", "interstellar", "extraterrestrial", "aliens?", "first contact", "robots?", "androids?", "speculative fiction", "space colonies", "galactic"],
    olSubjects: ["science fiction"],
  },
  fantasy: {
    fiction: true,
    label: "fantasy",
    kind: "genre",
    patterns: ["fantasy", "fantastic fiction", "wizards?", "dragons?", "elves", "imaginary places", "magic", "magicians", "sorcery", "quests? \\(expeditions\\)", "fairies", "mythical", "epic fantasy", "high fantasy"],
    olSubjects: ["fantasy"],
  },
  mystery: {
    fiction: true,
    label: "mystery",
    kind: "genre",
    patterns: ["mystery", "mysteries", "detective", "detectives", "whodunit", "private investigators", "amateur sleuths?", "cozy mystery"],
    olSubjects: ["mystery", "detective and mystery stories"],
  },
  thriller: {
    fiction: true,
    label: "thriller",
    kind: "genre",
    patterns: ["thrillers?", "suspense", "espionage", "spies", "spy stories", "psychological thriller", "conspiracies", "action & adventure", "fugitives", "kidnapping", "assassins?"],
    olSubjects: ["thrillers", "suspense"],
  },
  horror: {
    fiction: true,
    label: "horror",
    kind: "genre",
    patterns: ["horror", "ghosts?", "ghost stories", "haunted houses?", "vampires?", "zombies?", "monsters?", "occult", "demonology", "supernatural", "paranormal", "werewolves"],
    olSubjects: ["horror"],
  },
  romance: {
    fiction: true,
    label: "romance",
    kind: "genre",
    patterns: ["romance(?! literature| languages| philology| norte)", "love stories", "romantic", "romantic comedy", "man-woman relationships", "courtship", "dating \\(social customs\\)", "contemporary romance", "regency"],
    olSubjects: ["romance", "love stories"],
  },
  historical: {
    fiction: true,
    label: "historical fiction",
    kind: "genre",
    patterns: ["historical fiction", "fiction, historical", "historical novels?", "historical romance"],
    olSubjects: ["historical fiction"],
  },
  literary: {
    fiction: true,
    label: "literary fiction",
    kind: "genre",
    patterns: ["literary fiction", "fiction, literary", "psychological fiction", "domestic fiction", "bildungsromans?", "literary", "booker prize", "pulitzer prize", "national book award"],
    olSubjects: ["literary fiction", "psychological fiction"],
  },
  adventure: {
    fiction: true,
    label: "adventure",
    kind: "genre",
    patterns: ["adventure", "adventure stories", "adventure and adventurers", "voyages and travels", "sea stories", "treasure", "explorers?", "expeditions", "pirates"],
    olSubjects: ["adventure stories", "adventure"],
  },
  dystopian: {
    fiction: true,
    label: "dystopian",
    kind: "genre",
    patterns: ["dystopias?", "dystopian", "totalitarianism", "post-apocalyptic", "apocalyptic", "end of the world", "surveillance", "authoritarian", "utopias", "government, resistance to", "dictatorship"],
    olSubjects: ["dystopias"],
  },
  crime: {
    label: "crime",
    kind: "genre",
    patterns: ["crime", "criminals", "murder", "police", "serial murderers", "serial killers", "gangsters", "heists?", "robbery", "organized crime", "noir", "homicide investigation"],
    olSubjects: ["crime"],
  },
  ya: {
    fiction: true,
    label: "young adult",
    kind: "genre",
    patterns: ["young adult", "young adult fiction", "teenagers?", "teen", "high schools?", "juvenile fiction", "ya"],
    olSubjects: ["young adult fiction"],
  },
  contemporary: {
    fiction: true,
    label: "contemporary fiction",
    kind: "genre",
    patterns: ["contemporary", "contemporary fiction", "women's fiction", "family life", "city and town life", "modern fiction", "domestic fiction"],
    olSubjects: ["contemporary fiction", "family life"],
  },
  psychology: {
    label: "psychology",
    kind: "genre",
    nonfiction: true,
    patterns: ["psychology", "cognitive", "human behavior", "behavior", "neuroscience", "decision making", "emotions", "thought and thinking", "cognition", "social psychology", "personality", "brain"],
    olSubjects: ["psychology"],
  },
  philosophy: {
    label: "philosophy",
    kind: "genre",
    nonfiction: true,
    patterns: ["philosophy", "philosophical", "ethics", "existentialism", "stoics?", "stoicism", "metaphysics", "meaning \\(philosophy\\)", "meaning of life", "free will", "consciousness", "moral", "nihilism", "absurdism"],
    olSubjects: ["philosophy"],
  },
  business: {
    label: "business",
    kind: "genre",
    nonfiction: true,
    patterns: ["business", "management", "leadership", "entrepreneurship", "marketing", "success in business", "corporations", "strategic planning", "startups?", "organizational"],
    olSubjects: ["business", "management"],
  },
  technology: {
    label: "technology",
    kind: "genre",
    nonfiction: true,
    patterns: ["technology", "computers?", "internet", "software", "digital", "innovation", "information technology", "virtual reality", "computer programming", "social media", "technological"],
    olSubjects: ["technology"],
  },
  science: {
    label: "science",
    kind: "genre",
    nonfiction: true,
    patterns: ["science(?! fiction|-fiction)", "physics", "biology", "evolution", "cosmology", "astronomy", "chemistry", "mathematics", "genetics", "quantum theory", "astrophysics", "scientists", "medicine", "natural history"],
    olSubjects: ["popular science", "science"],
  },
  history: {
    label: "history",
    kind: "genre",
    nonfiction: true,
    patterns: ["history", "world war, 1939-1945", "world war, 1914-1918", "civilization", "ancient", "empires?", "revolution", "middle ages", "civil war", "colonies", "archaeology"],
    olSubjects: ["history"],
  },
  biography: {
    label: "biography",
    kind: "genre",
    nonfiction: true,
    patterns: ["biography", "biographies", "autobiography", "biography & autobiography", "correspondence", "personal narratives"],
    olSubjects: ["biography"],
  },
  selfhelp: {
    label: "self-help",
    kind: "genre",
    nonfiction: true,
    patterns: ["self-help", "self help", "self-actualization", "self-realization", "personal development", "conduct of life", "happiness", "success", "motivation \\(psychology\\)", "habits?", "mindfulness", "self-improvement"],
    olSubjects: ["self-help", "self-actualization (psychology)"],
  },
  economics: {
    label: "economics",
    kind: "genre",
    nonfiction: true,
    patterns: ["economics", "economic", "capitalism", "markets?", "money", "income distribution", "inequality", "finance", "investments?", "globalization", "economic history"],
    olSubjects: ["economics"],
  },
  productivity: {
    label: "productivity",
    kind: "genre",
    nonfiction: true,
    patterns: ["productivity", "time management", "work", "efficiency", "goal setting", "attention", "focus", "procrastination", "career development"],
    olSubjects: ["time management", "productivity"],
  },
  memoir: {
    label: "memoir",
    kind: "genre",
    nonfiction: true,
    patterns: ["memoirs?", "autobiography", "personal narratives", "biography & autobiography / personal memoirs"],
    olSubjects: ["memoir", "autobiography"],
  },
  classics: {
    label: "classic",
    kind: "theme",
    patterns: ["classics?", "classic literature", "great books", "literature"],
    olSubjects: ["classic literature"],
  },
  humor: {
    label: "humor",
    kind: "theme",
    patterns: ["humor", "humorous", "humorous fiction", "humorous stories", "comedy", "comic", "satire", "wit and humor", "funny"],
    olSubjects: ["humorous fiction", "humor"],
  },
  thoughtful: {
    label: "ideas",
    kind: "theme",
    patterns: ["philosophical", "philosophy", "social problems", "identity", "consciousness", "free will", "ethics", "existential", "political fiction", "allegories", "society", "human nature", "meaning"],
    olSubjects: ["philosophy", "social problems", "political fiction"],
  },
  emotional: {
    label: "emotional stories",
    kind: "theme",
    patterns: ["grief", "loss \\(psychology\\)", "bereavement", "loneliness", "mothers and daughters", "fathers and sons", "family relationships", "interpersonal relations", "heartbreak", "healing", "redemption", "forgiveness"],
    olSubjects: ["family relationships", "grief", "interpersonal relations"],
  },
  dark: {
    label: "dark themes",
    kind: "theme",
    patterns: ["psychological fiction", "dark", "madness", "insanity", "mental illness", "abuse", "cults?", "cannibalism", "torture", "despair", "obsession", "revenge", "evil", "suicide"],
    olSubjects: ["psychological fiction", "good and evil"],
  },
  cozy: {
    label: "cozy reads",
    kind: "theme",
    patterns: ["cozy", "cosy", "small town", "small town life", "village life", "bookstores?", "booksellers", "cats", "tea", "cooking", "bakeries", "baking", "gardening", "found family", "comfort", "slice of life", "cafes?", "community life", "heartwarming", "feel-good", "charming", "delightful", "whimsical", "uplifting", "gentle", "romantic comedy", "humorous fiction"],
    olSubjects: ["humorous fiction", "romantic comedy", "cozy mystery"],
  },
  family: {
    label: "family",
    kind: "theme",
    patterns: ["families", "family", "family life", "mothers", "fathers", "sisters", "brothers", "domestic fiction", "marriage"],
    olSubjects: ["family life"],
  },
  war: {
    label: "war",
    kind: "theme",
    patterns: ["war", "wars?", "world war", "soldiers", "battles?", "military", "warfare", "holocaust"],
    olSubjects: ["war"],
  },
  nature: {
    label: "nature",
    kind: "theme",
    patterns: ["(?<!human )nature", "wilderness", "ecology", "environment", "animals", "natural history", "climate", "oceans?", "forests?", "mountains"],
    olSubjects: ["nature"],
  },
  spirituality: {
    label: "spirituality",
    kind: "theme",
    patterns: ["spiritual", "spirituality", "religion", "buddhism", "meditation", "faith", "god", "mysticism", "zen"],
    olSubjects: ["spirituality"],
  },
  politics: {
    label: "politics and power",
    kind: "theme",
    patterns: ["politics", "political", "power \\(social sciences\\)", "government", "revolutions?", "propaganda", "democracy", "elections", "kings and rulers", "imperialism"],
    olSubjects: ["politics and government", "political fiction"],
  },
  society: {
    label: "society",
    kind: "theme",
    patterns: ["social", "society", "social problems", "social classes", "race relations", "culture", "civilization", "sociology", "anthropology", "social conditions", "class"],
    olSubjects: ["social problems", "social conditions"],
  },
  ai: {
    label: "artificial intelligence",
    kind: "theme",
    patterns: ["artificial intelligence", "robots?", "androids?", "machine learning", "computers", "cyborgs", "virtual reality", "simulation"],
    olSubjects: ["artificial intelligence"],
  },
  space: {
    label: "space",
    kind: "theme",
    patterns: ["space", "outer space", "space flight", "space travel", "astronauts", "space ships", "spaceships", "interstellar travel", "planets", "space warfare", "mars \\(planet\\)", "moon", "space colonies"],
    olSubjects: ["space flight", "outer space"],
  },
  magic: {
    label: "magic",
    kind: "theme",
    patterns: ["magic", "wizards", "witches", "spells", "sorcerers", "magicians", "magical realism", "fairy tales"],
    olSubjects: ["magic"],
  },
  worldbuilding: {
    label: "vast imagined worlds",
    kind: "theme",
    patterns: ["imaginary places", "imaginary wars and battles", "epic", "kingdoms", "empires", "galactic empire", "interplanetary voyages", "middle earth", "invented worlds", "planets"],
    olSubjects: ["imaginary places", "imaginary wars and battles"],
  },
  timetravel: {
    label: "time travel",
    kind: "theme",
    patterns: ["time travel", "time-travel"],
    olSubjects: ["time travel"],
  },
  survival: {
    label: "survival",
    kind: "theme",
    patterns: ["survival", "survival skills", "castaways", "shipwrecks", "wilderness survival", "disasters"],
    olSubjects: ["survival"],
  },
  gothic: {
    label: "gothic atmosphere",
    kind: "theme",
    patterns: ["gothic", "gothic fiction", "haunted", "castles", "atmospheric"],
    olSubjects: ["gothic fiction"],
  },
  satire: {
    label: "satire",
    kind: "theme",
    patterns: ["satire", "satirical", "parody", "black humor", "absurd"],
    olSubjects: ["satire"],
  },
  comingofage: {
    label: "coming of age",
    kind: "theme",
    patterns: ["coming of age", "bildungsromans?", "growing up", "adolescence", "teenage", "youth"],
    olSubjects: ["coming of age"],
  },
  children: {
    label: "children's books",
    kind: "theme",
    patterns: ["children's fiction", "children's stories", "picture books", "juvenile literature", "children's books", "board books", "stories in rhyme", "readers \\(primary\\)", "bedtime"],
    olSubjects: [],
  },
  erotica: {
    label: "explicit content",
    kind: "theme",
    patterns: ["erotica", "erotic", "erotic fiction", "sexual", "sex instruction", "sexual behavior", "kama sutra", "bdsm", "explicit"],
    olSubjects: [],
  },
  violence: {
    label: "violence",
    kind: "theme",
    patterns: ["violence", "violent", "murder", "serial murderers", "torture", "war", "massacres", "gangs", "brutality", "assassination"],
    olSubjects: [],
  },
  grief: {
    label: "grief and loss",
    kind: "theme",
    patterns: ["grief", "death", "bereavement", "loss \\(psychology\\)", "dying", "terminal illness", "mourning", "suicide", "cancer", "tragedies?", "tragic"],
    olSubjects: ["grief"],
  },
  love: {
    label: "love",
    kind: "theme",
    patterns: ["love", "lovers", "love stories", "romance", "relationships", "marriage", "courtship"],
    olSubjects: ["love"],
  },
  friendship: {
    label: "friendship",
    kind: "theme",
    patterns: ["friendship", "friends", "found family", "best friends"],
    olSubjects: ["friendship"],
  },
  mentalhealth: {
    label: "mental health",
    kind: "theme",
    patterns: ["mental health", "mental illness", "depression", "anxiety", "trauma", "psychological trauma", "ptsd", "addiction"],
    olSubjects: ["mental illness"],
  },
};

export const TAG_IDS = Object.keys(TAGS) as TagId[];

/** One compiled regex per tag for fast matching against lowercased text. */
export const TAG_REGEX: Record<TagId, RegExp> = Object.fromEntries(
  TAG_IDS.map((id) => [id, new RegExp(`(?:^|[^a-z])(?:${TAGS[id].patterns.join("|")})(?:$|[^a-z])`, "i")]),
) as Record<TagId, RegExp>;

export type WeightedTags = Partial<Record<TagId, number>>;

/* ------------------------------------------------------------- preference maps */

export const MOOD_TAGS: Record<MoodId, WeightedTags> = {
  think: { thoughtful: 1, philosophy: 0.9, dystopian: 0.7, society: 0.6, psychology: 0.6, ai: 0.6, satire: 0.6, science: 0.5, scifi: 0.35, literary: 0.4, politics: 0.4, classics: 0.3 },
  escape: { fantasy: 1, scifi: 1, worldbuilding: 0.9, magic: 0.8, adventure: 0.8, space: 0.7, timetravel: 0.6 },
  emotional: { emotional: 1, grief: 0.85, family: 0.75, love: 0.65, friendship: 0.6, literary: 0.6, comingofage: 0.6, mentalhealth: 0.4 },
  hooked: { thriller: 1, mystery: 1, crime: 0.9, adventure: 0.5, horror: 0.4, survival: 0.4 },
  uncomfortable: { horror: 1, dark: 1, gothic: 0.7, violence: 0.6, mentalhealth: 0.5, dystopian: 0.5, crime: 0.3 },
  grow: { selfhelp: 1, psychology: 0.8, productivity: 0.8, philosophy: 0.6, business: 0.5, spirituality: 0.4, biography: 0.35 },
  cozy: { cozy: 1, humor: 0.45, friendship: 0.35, magic: 0.2, mystery: 0.2 },
  learn: { history: 1, science: 1, economics: 0.8, technology: 0.8, biography: 0.7, nature: 0.6, politics: 0.5, society: 0.5, psychology: 0.5 },
};

/** Tags that work against a mood: a "cozy" request should not surface war novels that mention friendship. */
export const MOOD_COUNTER_TAGS: Partial<Record<MoodId, WeightedTags>> = {
  cozy: { dark: 0.85, grief: 0.7, war: 0.7, violence: 0.8, horror: 0.9, mentalhealth: 0.5, dystopian: 0.6 },
  uncomfortable: { cozy: 0.8, humor: 0.5, children: 0.8 },
  hooked: { classics: 0.25, philosophy: 0.4 },
  escape: { memoir: 0.5, selfhelp: 0.6 },
  emotional: { selfhelp: 0.5, business: 0.6 },
  think: { children: 0.7 },
};

export const GENRE_TAGS: Record<GenreId, WeightedTags> = {
  fantasy: { fantasy: 1, magic: 0.5 },
  "science-fiction": { scifi: 1, space: 0.4 },
  mystery: { mystery: 1 },
  thriller: { thriller: 1 },
  horror: { horror: 1 },
  romance: { romance: 1, love: 0.5 },
  "historical-fiction": { historical: 1 },
  "literary-fiction": { literary: 1, classics: 0.3 },
  adventure: { adventure: 1 },
  dystopian: { dystopian: 1 },
  crime: { crime: 1 },
  "young-adult": { ya: 1 },
  contemporary: { contemporary: 1 },
  psychology: { psychology: 1 },
  philosophy: { philosophy: 1 },
  business: { business: 1 },
  technology: { technology: 1, ai: 0.4 },
  science: { science: 1 },
  history: { history: 1 },
  biography: { biography: 1 },
  "self-help": { selfhelp: 1 },
  economics: { economics: 1 },
  productivity: { productivity: 1, selfhelp: 0.4 },
  memoir: { memoir: 1, biography: 0.5 },
};

export const FICTION_GENRES = new Set<GenreId>([
  "fantasy",
  "science-fiction",
  "mystery",
  "thriller",
  "horror",
  "romance",
  "historical-fiction",
  "literary-fiction",
  "adventure",
  "dystopian",
  "crime",
  "young-adult",
  "contemporary",
]);

export const GOAL_TAGS: Record<GoalId, WeightedTags> = {
  perspective: { thoughtful: 1, philosophy: 0.8, dystopian: 0.6, society: 0.6, literary: 0.5 },
  knowledge: { science: 1, history: 1, economics: 0.7, technology: 0.7, biography: 0.5 },
  motivation: { selfhelp: 1, productivity: 0.8, biography: 0.6, business: 0.5 },
  emotional: { emotional: 1, grief: 0.7, love: 0.6, literary: 0.6, family: 0.5 },
  entertainment: { thriller: 0.8, adventure: 0.8, fantasy: 0.7, mystery: 0.7, humor: 0.8 },
  inspiration: { biography: 0.9, memoir: 0.9, selfhelp: 0.6, spirituality: 0.5 },
  people: { psychology: 1, literary: 0.7, emotional: 0.6, society: 0.6, family: 0.5 },
  myself: { psychology: 1, selfhelp: 0.8, philosophy: 0.7, memoir: 0.6, spirituality: 0.5 },
  talk: { thoughtful: 0.9, dystopian: 0.7, society: 0.7, politics: 0.5, satire: 0.5 },
  escape: { fantasy: 1, scifi: 0.9, adventure: 0.8, magic: 0.6, worldbuilding: 0.6 },
  "new-world": { worldbuilding: 1, fantasy: 0.9, scifi: 0.9, space: 0.6, magic: 0.6 },
};

export const AVOID_TAGS: Record<AvoidId, WeightedTags> = {
  "too-slow": { classics: 0.35, literary: 0.3 },
  depressing: { grief: 0.8, dark: 0.8, war: 0.4, mentalhealth: 0.4 },
  romance: { romance: 1, love: 0.55, erotica: 1 },
  violence: { violence: 1, war: 0.7, horror: 0.5, crime: 0.4 },
  horror: { horror: 1, gothic: 0.5 },
  complicated: { philosophy: 0.4, classics: 0.4 },
  long: {},
  "self-help": { selfhelp: 1, productivity: 0.8 },
  business: { business: 1, economics: 0.5 },
  "dense-philosophy": { philosophy: 0.9 },
  "sad-endings": { grief: 0.8, dark: 0.6 },
  explicit: { erotica: 1 },
};

/* ----------------------------------------------------------- free-text lexicon */

/** Phrases a reader might type, mapped to tags. Multi-word keys are matched before single words. */
export const LEXICON: Record<string, WeightedTags> = {
  "black mirror": { technology: 0.9, dystopian: 0.9, scifi: 0.7, ai: 0.6, society: 0.7, dark: 0.35 },
  "harry potter": { fantasy: 1, magic: 1, ya: 0.6, friendship: 0.5 },
  "lord of the rings": { fantasy: 1, worldbuilding: 1, adventure: 0.8 },
  tolkien: { fantasy: 1, worldbuilding: 1, adventure: 0.7 },
  "game of thrones": { fantasy: 1, worldbuilding: 0.8, politics: 0.7, violence: 0.5 },
  sherlock: { mystery: 1, crime: 0.6 },
  "agatha christie": { mystery: 1, crime: 0.5 },
  "stephen king": { horror: 1, dark: 0.6 },
  "true detective": { crime: 1, dark: 0.7, mystery: 0.6 },
  westworld: { ai: 1, scifi: 0.8, philosophy: 0.5 },
  interstellar: { space: 1, scifi: 1, science: 0.5 },
  "the martian": { scifi: 1, space: 0.8, survival: 0.8, science: 0.6, humor: 0.4 },
  "studio ghibli": { fantasy: 0.8, cozy: 0.7, nature: 0.5 },
  ghibli: { fantasy: 0.8, cozy: 0.7, nature: 0.5 },
  succession: { family: 0.6, business: 0.5, satire: 0.6 },
  "the office": { humor: 1 },
  "time travel": { timetravel: 1, scifi: 0.7 },
  "artificial intelligence": { ai: 1, scifi: 0.6, technology: 0.6 },
  "coming of age": { comingofage: 1 },
  "small town": { cozy: 0.6, contemporary: 0.5 },
  "found family": { friendship: 1, cozy: 0.6 },
  "slow burn": { romance: 0.6, love: 0.6 },
  "page turner": { thriller: 0.8, mystery: 0.6 },
  "page-turner": { thriller: 0.8, mystery: 0.6 },
  "world building": { worldbuilding: 1 },
  worldbuilding: { worldbuilding: 1 },
  "mind bending": { thoughtful: 0.8, scifi: 0.5, philosophy: 0.5 },
  "mind-bending": { thoughtful: 0.8, scifi: 0.5, philosophy: 0.5 },
  "true crime": { crime: 1, history: 0.4 },
  "magical realism": { magic: 1, literary: 0.6 },
  "1984": { dystopian: 1, politics: 0.7 },
  orwell: { dystopian: 1, politics: 0.7 },
  philosophical: { philosophy: 1, thoughtful: 0.9 },
  philosophy: { philosophy: 1, thoughtful: 0.8 },
  existential: { philosophy: 0.9, thoughtful: 0.8 },
  thriller: { thriller: 1 },
  thrillers: { thriller: 1 },
  suspense: { thriller: 0.9 },
  twisty: { thriller: 0.7, mystery: 0.7 },
  twist: { thriller: 0.6, mystery: 0.6 },
  twists: { thriller: 0.6, mystery: 0.6 },
  mystery: { mystery: 1 },
  detective: { mystery: 1, crime: 0.5 },
  murder: { crime: 0.9, mystery: 0.6 },
  heist: { crime: 0.9, thriller: 0.6 },
  funny: { humor: 1 },
  hilarious: { humor: 1 },
  humor: { humor: 1 },
  humour: { humor: 1 },
  witty: { humor: 0.8 },
  cozy: { cozy: 1 },
  cosy: { cozy: 1 },
  comforting: { cozy: 1 },
  comfort: { cozy: 0.9 },
  wholesome: { cozy: 1 },
  heartwarming: { cozy: 0.9, emotional: 0.4 },
  warm: { cozy: 0.6 },
  gentle: { cozy: 0.6 },
  dark: { dark: 0.9 },
  bleak: { dark: 0.9 },
  creepy: { horror: 0.8, gothic: 0.5 },
  scary: { horror: 1 },
  horror: { horror: 1 },
  gothic: { gothic: 1, horror: 0.3 },
  disturbing: { dark: 1, horror: 0.5 },
  depressing: { dark: 0.8, grief: 0.7 },
  sad: { grief: 0.7, emotional: 0.6 },
  violent: { violence: 1 },
  violence: { violence: 1 },
  gore: { violence: 1, horror: 0.6 },
  space: { space: 1, scifi: 0.8 },
  aliens: { scifi: 1, space: 0.6 },
  robots: { ai: 1, scifi: 0.7 },
  ai: { ai: 1, scifi: 0.5, technology: 0.5 },
  technology: { technology: 1 },
  tech: { technology: 0.9 },
  dystopia: { dystopian: 1 },
  dystopian: { dystopian: 1 },
  apocalypse: { dystopian: 0.9, survival: 0.6 },
  "post-apocalyptic": { dystopian: 1, survival: 0.7 },
  magic: { magic: 1, fantasy: 0.8 },
  dragons: { fantasy: 1 },
  fantasy: { fantasy: 1 },
  "sci-fi": { scifi: 1 },
  scifi: { scifi: 1 },
  "science fiction": { scifi: 1 },
  romantic: { romance: 1, love: 0.8 },
  romance: { romance: 1, love: 0.7 },
  love: { love: 0.9, romance: 0.4 },
  war: { war: 1 },
  survival: { survival: 1 },
  nature: { nature: 1 },
  ocean: { nature: 0.7, adventure: 0.4 },
  family: { family: 1 },
  grief: { grief: 1, emotional: 0.7 },
  friendship: { friendship: 1 },
  history: { history: 1 },
  historical: { historical: 0.8, history: 0.4 },
  science: { science: 1 },
  physics: { science: 1 },
  biology: { science: 1, nature: 0.4 },
  economics: { economics: 1 },
  money: { economics: 0.8 },
  business: { business: 1 },
  startup: { business: 1, technology: 0.4 },
  psychology: { psychology: 1 },
  mind: { psychology: 0.7, thoughtful: 0.4 },
  politics: { politics: 1 },
  political: { politics: 1 },
  society: { society: 1 },
  satire: { satire: 1, humor: 0.5 },
  memoir: { memoir: 1 },
  biography: { biography: 1 },
  "self-help": { selfhelp: 1 },
  habits: { selfhelp: 0.9, productivity: 0.8 },
  productivity: { productivity: 1 },
  spiritual: { spirituality: 1 },
  adventure: { adventure: 1 },
  epic: { worldbuilding: 0.8, adventure: 0.6 },
  quest: { adventure: 0.9, fantasy: 0.5 },
  atmospheric: { gothic: 0.6, literary: 0.4 },
  literary: { literary: 1 },
  classic: { classics: 1 },
  classics: { classics: 1 },
  ya: { ya: 1 },
  teen: { ya: 0.9 },
  emotional: { emotional: 1 },
  "thought-provoking": { thoughtful: 1, philosophy: 0.5 },
  thoughtful: { thoughtful: 0.9 },
  smart: { thoughtful: 0.7 },
  clever: { thoughtful: 0.6 },
  identity: { thoughtful: 0.6, comingofage: 0.4 },
  consciousness: { philosophy: 0.9, ai: 0.4 },
  simulation: { ai: 0.8, philosophy: 0.5, scifi: 0.6 },
  ethics: { philosophy: 1, thoughtful: 0.6 },
  surveillance: { dystopian: 1, technology: 0.6 },
};

/** Cues that a free-text request is about stories (fiction) or about facts (non-fiction). */
export const FICTION_CUES =
  /\b(black mirror|harry potter|lord of the rings|game of thrones|westworld|true detective|sherlock|ghibli|the martian|interstellar|novels?|fiction|story|stories|characters?|plot|protagonist|narrator|thriller|mystery|fantasy|sci-?fi|science fiction|romance|horror|twists?|world-?building|dystopi\w*|magic|dragons|detective)\b/;
export const NONFICTION_CUES = /\b(non-?fiction|true story|real life|history of|biography|memoir|self-help|essays?|learn about|explain(s|ing)?|science of|how to|research|guide)\b/;

export const STOPWORDS = new Set(
  "a an and are as at be book books but by for from has have i i'd i'm im in into is it its it's just kind like looking me more most much my of on or read reading really so some something story stories than that the their them then there these they thing this to too very want wants was with would you your meets mix mixed sort type feel feels feeling make makes made please about good great nice new one ones lot lots bit kinda".split(
    " ",
  ),
);

export const NEGATION = /\b(not|no|without|avoid|nothing|never|don'?t|isn'?t|aren'?t|less|hate|dislike|skip)\b/;

/* ------------------------------------------------------------ subject cleanup */

/** Subject headings that carry no meaning for taste: library housekeeping, formats, awards lists. */
const NOISE_SUBJECT =
  /^(fiction|general|fiction, general|novel|novels|roman|romans|literature|english fiction|american fiction|english literature|american literature|accessible book|protected daisy|in library|lending library|large type books|open library staff picks|long now manual for civilization|internet archive wishlist|overdrive|ebooks?|audiobooks?|reading level.*|translations into .*|nyt:.*|new york times .*|award:.*|series:.*|.*bestseller.*|place:.*|time:.*|person:.*|spanish language materials|fiction in english|books and reading|fiction, science fiction, general|juvenile works|large print|children's literature|textbooks|english language|study and teaching|criticism and interpretation|history and criticism|literary collections|readers|kindle|reviews|translations|book clubs|picture books|classic literature)$/;

/** Split compound headings ("Fiction, science fiction, general") into meaningful lowercase phrases. */
export function normalizeSubjects(subjects: string[], max = 60): string[] {
  const out = new Set<string>();
  for (const raw of subjects) {
    const lower = raw.toLowerCase().replace(/\s+/g, " ").trim();
    if (!lower || NOISE_SUBJECT.test(lower)) continue;
    const parts = lower.split(/\s*(?:,|--|\/|;)\s*/);
    for (const p of parts) {
      const part = p.replace(/[.()]/g, "").trim();
      if (part.length < 3 || part.length > 60 || NOISE_SUBJECT.test(part)) continue;
      if (/^\d+(th|st|nd|rd)? century$|^\d{4}(-\d{4})?$/.test(part)) continue;
      out.add(part);
      if (out.size >= max) return Array.from(out);
    }
  }
  return Array.from(out);
}
