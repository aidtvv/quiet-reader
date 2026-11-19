export type ArticleRef = {
  id: string;
  href: string;
  title: string;
  sectionId: string;
  sectionTitle: string;
};

export type BookSection = {
  id: string;
  title: string;
  href?: string;
  articles: ArticleRef[];
};

export type ParsedBook = {
  bookId: string;
  title: string;
  issueDate?: string;
  sections: BookSection[];
};

export type LoadedArticle = {
  ref: ArticleRef;
  html: string;
  plainText: string;
  excerpt: string;
  images: Record<string, string>;
  rubric?: string;
};

export type ArticleIndexEntry = {
  excerpt: string;
  hitCount: number;
};

export type WordListEntry = {
  name: string;
  trans: string[];
  usphone?: string;
  ukphone?: string;
};

export type PluginMeta = {
  id: string;
  name: string;
  type: "wordlist";
  description?: string;
  wordCount: number;
  matchableCount: number;
  source: string;
  license: string;
  file: string;
  defaultEnabled?: boolean;
};

export type PluginManifest = {
  version: number;
  plugins: PluginMeta[];
};

export type DictEntry = {
  lemma: string;
  entry: WordListEntry;
  lists: string[];
};

export type WordEntry = {
  lemma: string;
  surface: string;
  phonetic?: string;
  trans: string[];
  lists: string[];
  sentence?: string;
  bookId?: string;
  bookTitle?: string;
  section?: string;
  articleId?: string;
  articleTitle?: string;
  addedAt: number;
};

export type Bookmark = {
  id: string;
  bookId: string;
  bookTitle: string;
  section: string;
  articleId: string;
  articleTitle: string;
  createdAt: number;
};

export type Settings = {
  enabledPlugins: string[];
  pluginsInitialized: boolean;
  zoom: number;
  autoFit?: boolean;
  warm: boolean;
  light?: boolean;
  darkTheme?: string;
  lightTheme?: string;
  filterBasic?: boolean;
  fontFamily?: "lora" | "inter" | "system";
  fontSize?: number;
  lineHeight?: number;
  readerWidth?: number;
  clickLookup?: boolean;
  autoSpeak?: boolean;
  autoSaveWord?: boolean;
  autoSync?: boolean;
  ankiConnectEnabled?: boolean;
  ankiConnectUrl?: string;
  ankiDeck?: string;
  /** 引用已有牌组：优先把牌组里现成的卡片移动到目标子牌组，而不是新建卡片。 */
  ankiReuseExisting?: boolean;
  /** 引用时从哪个牌组里找卡片；留空表示在整个收藏中查找。 */
  ankiSourceDeck?: string;
  leftPinned?: boolean;
  rightPinned?: boolean;
  lastBookId?: string;
  lastArticleByBook: Record<string, string>;
};

export type NavTab = "outline" | "cards" | "wordbook" | "bookmarks";
