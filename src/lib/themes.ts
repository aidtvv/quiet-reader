/**
 * 多主题系统：每套主题是一组语义 token，applyTheme() 把它们写成 CSS 变量，
 * 主题样式层（theme.css）只消费变量，不绑定任何一套配色。
 * 结构与参考项目 Ticking Dashboard 的 utils/themes.ts 一致：
 * 深色 / 浅色主题分开保存，外观模式决定当前使用哪一套。
 */

export type ThemeTokens = {
  bg: string;
  stage: string;
  bar: string;
  panel: string;
  paper: string;
  inset: string;
  soft: string;
  hover: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  hairline: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  accentStrong: string;
  accentBorder: string;
  primary: string;
  primaryHover: string;
  live: string;
  danger: string;
  dangerStrong: string;
  dangerSoft: string;
  gold: string;
  goldSoft: string;
  shadow: string;
};

export type ThemeEntry = {
  label: string;
  dark: boolean;
  /** 用于主题卡片上的三色渐变预览。 */
  swatch: [string, string, string];
  tokens: ThemeTokens;
};

export const DEFAULT_DARK_THEME = "quiet-dark";
export const DEFAULT_LIGHT_THEME = "quiet-light";

export const THEMES: Record<string, ThemeEntry> = {
  "quiet-dark": {
    label: "静读 · 墨绿",
    dark: true,
    swatch: ["#b8cead", "#5d6e53", "#242424"],
    tokens: {
      bg: "#191919",
      stage: "#191919",
      bar: "#202020",
      panel: "#242424",
      paper: "#1d1d1d",
      inset: "#1b1b1b",
      soft: "#202020",
      hover: "#262626",
      text: "#ecece4",
      muted: "#a2a29a",
      faint: "#78786f",
      border: "#3a3a3a",
      hairline: "#343434",
      accent: "#b8cead",
      accentText: "#1a1d18",
      accentSoft: "#2b3027",
      accentStrong: "#d5e2cc",
      accentBorder: "#465441",
      primary: "#8fa881",
      primaryHover: "#9db98e",
      live: "#9fbf8f",
      danger: "#d08a8a",
      dangerStrong: "#e0a0a0",
      dangerSoft: "#342424",
      gold: "#d9b27c",
      goldSoft: "#332a1e",
      shadow: "rgba(0, 0, 0, 0.5)",
    },
  },
  everforest: {
    label: "Everforest",
    dark: true,
    swatch: ["#a7c080", "#7fbbb3", "#2d353b"],
    tokens: {
      bg: "#2d353b",
      stage: "#2b3339",
      bar: "#343f44",
      panel: "#343f44",
      paper: "#2a3238",
      inset: "#2b3339",
      soft: "#333d42",
      hover: "#3b474c",
      text: "#d3c6aa",
      muted: "#9da9a0",
      faint: "#859289",
      border: "#4b5652",
      hairline: "#414a48",
      accent: "#a7c080",
      accentText: "#232a2e",
      accentSoft: "#3c4a3a",
      accentStrong: "#d3c6aa",
      accentBorder: "#5b6f52",
      primary: "#7f9a61",
      primaryHover: "#8dac6d",
      live: "#a7c080",
      danger: "#e67e80",
      dangerStrong: "#e9989a",
      dangerSoft: "#3f2d2e",
      gold: "#dbbc7f",
      goldSoft: "#3d3627",
      shadow: "rgba(0, 0, 0, 0.45)",
    },
  },
  nord: {
    label: "Nord",
    dark: true,
    swatch: ["#88c0d0", "#81a1c1", "#2e3440"],
    tokens: {
      bg: "#2e3440",
      stage: "#2e3440",
      bar: "#333b49",
      panel: "#3b4252",
      paper: "#303844",
      inset: "#2b313d",
      soft: "#353d4b",
      hover: "#3f4959",
      text: "#eceff4",
      muted: "#a3abbc",
      faint: "#7b88a1",
      border: "#4c566a",
      hairline: "#434c5e",
      accent: "#88c0d0",
      accentText: "#20262f",
      accentSoft: "#33424f",
      accentStrong: "#eceff4",
      accentBorder: "#4f6b7a",
      primary: "#6f9aa8",
      primaryHover: "#7fabb9",
      live: "#a3be8c",
      danger: "#bf616a",
      dangerStrong: "#d0858c",
      dangerSoft: "#3c2b2f",
      gold: "#ebcb8b",
      goldSoft: "#3b3527",
      shadow: "rgba(0, 0, 0, 0.45)",
    },
  },
  gruvbox: {
    label: "Gruvbox",
    dark: true,
    swatch: ["#fabd2f", "#83a598", "#282828"],
    tokens: {
      bg: "#282828",
      stage: "#282828",
      bar: "#32302f",
      panel: "#3c3836",
      paper: "#302e2c",
      inset: "#262421",
      soft: "#35322f",
      hover: "#3f3b38",
      text: "#ebdbb2",
      muted: "#bdae93",
      faint: "#a89984",
      border: "#504945",
      hairline: "#45413c",
      accent: "#fabd2f",
      accentText: "#282828",
      accentSoft: "#4b3f2a",
      accentStrong: "#fbf1c7",
      accentBorder: "#6b5a30",
      primary: "#b8a14a",
      primaryHover: "#cab457",
      live: "#b8bb26",
      danger: "#fb4934",
      dangerStrong: "#ff6a58",
      dangerSoft: "#40251f",
      gold: "#fe8019",
      goldSoft: "#3d2e1c",
      shadow: "rgba(0, 0, 0, 0.45)",
    },
  },
  "tokyo-night": {
    label: "Tokyo Night",
    dark: true,
    swatch: ["#7aa2f7", "#bb9af7", "#1a1b26"],
    tokens: {
      bg: "#1a1b26",
      stage: "#1a1b26",
      bar: "#1f2233",
      panel: "#24283b",
      paper: "#20222f",
      inset: "#1c1e2b",
      soft: "#232637",
      hover: "#2b3049",
      text: "#c0caf5",
      muted: "#7982b9",
      faint: "#565f89",
      border: "#414868",
      hairline: "#353b58",
      accent: "#7aa2f7",
      accentText: "#16171f",
      accentSoft: "#2a3550",
      accentStrong: "#c0caf5",
      accentBorder: "#3f5985",
      primary: "#5b7fc4",
      primaryHover: "#6b8fd5",
      live: "#9ece6a",
      danger: "#f7768e",
      dangerStrong: "#ff8fa3",
      dangerSoft: "#3a2630",
      gold: "#e0af68",
      goldSoft: "#363024",
      shadow: "rgba(0, 0, 0, 0.5)",
    },
  },
  "rose-pine": {
    label: "Rosé Pine",
    dark: true,
    swatch: ["#ebbcba", "#c4a7e7", "#191724"],
    tokens: {
      bg: "#191724",
      stage: "#191724",
      bar: "#1f1d2e",
      panel: "#1f1d2e",
      paper: "#1b1927",
      inset: "#181624",
      soft: "#211f30",
      hover: "#2a2740",
      text: "#e0def4",
      muted: "#908caa",
      faint: "#6e6a86",
      border: "#403d52",
      hairline: "#332f45",
      accent: "#ebbcba",
      accentText: "#1c1a2a",
      accentSoft: "#3a2f3c",
      accentStrong: "#f0e9f2",
      accentBorder: "#5d4a58",
      primary: "#b08a89",
      primaryHover: "#c39b9a",
      live: "#9ccfd8",
      danger: "#eb6f92",
      dangerStrong: "#f08aa5",
      dangerSoft: "#3a2631",
      gold: "#f6c177",
      goldSoft: "#383024",
      shadow: "rgba(0, 0, 0, 0.5)",
    },
  },
  "quiet-light": {
    label: "静读 · 米白",
    dark: false,
    swatch: ["#b8cead", "#6f8f5f", "#f3f1e9"],
    tokens: {
      bg: "#f3f1e9",
      stage: "#f2f0e7",
      bar: "#fbfaf5",
      panel: "#fffef9",
      paper: "#fffdf7",
      inset: "#f1efe7",
      soft: "#f7f6ef",
      hover: "#f0eee6",
      text: "#2b2d25",
      muted: "#6f7065",
      faint: "#8d8e83",
      border: "#e3dfd2",
      hairline: "#e6e1d4",
      accent: "#4c6b41",
      accentText: "#ffffff",
      accentSoft: "#e2ead9",
      accentStrong: "#42553a",
      accentBorder: "#b9c9ad",
      primary: "#6f8f5f",
      primaryHover: "#618153",
      live: "#6f8c5e",
      danger: "#a15656",
      dangerStrong: "#8f4545",
      dangerSoft: "#f7e9e9",
      gold: "#8a6534",
      goldSoft: "#f3e9d8",
      shadow: "rgba(70, 64, 45, 0.18)",
    },
  },
  "solarized-light": {
    label: "Solarized Light",
    dark: false,
    swatch: ["#268bd2", "#859900", "#fdf6e3"],
    tokens: {
      bg: "#fdf6e3",
      stage: "#f9f2df",
      bar: "#f7f1de",
      panel: "#fffbf0",
      paper: "#fffdf5",
      inset: "#f1ead6",
      soft: "#f5efdc",
      hover: "#efe8d5",
      text: "#3d4b52",
      muted: "#657b83",
      faint: "#8a9a9e",
      border: "#ded7c3",
      hairline: "#e7e0cc",
      accent: "#268bd2",
      accentText: "#ffffff",
      accentSoft: "#dfeaf4",
      accentStrong: "#1670ad",
      accentBorder: "#a9c9e2",
      primary: "#268bd2",
      primaryHover: "#1670ad",
      live: "#859900",
      danger: "#dc322f",
      dangerStrong: "#b02623",
      dangerSoft: "#f9e3e0",
      gold: "#b58900",
      goldSoft: "#f6ecd0",
      shadow: "rgba(70, 65, 45, 0.18)",
    },
  },
  "nord-light": {
    label: "Nord Light",
    dark: false,
    swatch: ["#5e81ac", "#8fbcbb", "#eceff4"],
    tokens: {
      bg: "#eceff4",
      stage: "#eef1f6",
      bar: "#f7f8fa",
      panel: "#ffffff",
      paper: "#fdfdfe",
      inset: "#e5e9f0",
      soft: "#f0f3f7",
      hover: "#e9edf3",
      text: "#2e3440",
      muted: "#4c566a",
      faint: "#7b88a1",
      border: "#d8dee9",
      hairline: "#e0e5ee",
      accent: "#5e81ac",
      accentText: "#ffffff",
      accentSoft: "#dde6f1",
      accentStrong: "#486891",
      accentBorder: "#aebfd6",
      primary: "#5e81ac",
      primaryHover: "#486891",
      live: "#4f8a6d",
      danger: "#bf616a",
      dangerStrong: "#a04d55",
      dangerSoft: "#f7e7e8",
      gold: "#b58a4e",
      goldSoft: "#f4ecdf",
      shadow: "rgba(46, 52, 64, 0.16)",
    },
  },
  "gruvbox-light": {
    label: "Gruvbox Light",
    dark: false,
    swatch: ["#b57614", "#076678", "#fbf1c7"],
    tokens: {
      bg: "#fbf1c7",
      stage: "#f7efc9",
      bar: "#f7efc9",
      panel: "#fff8dc",
      paper: "#fffaf0",
      inset: "#f2e5bc",
      soft: "#f5ecca",
      hover: "#f0e4b8",
      text: "#3c3836",
      muted: "#7c6f64",
      faint: "#928374",
      border: "#d5c4a1",
      hairline: "#e0d3b3",
      accent: "#b57614",
      accentText: "#ffffff",
      accentSoft: "#f0e2be",
      accentStrong: "#8f5b0e",
      accentBorder: "#cbb27e",
      primary: "#b57614",
      primaryHover: "#8f5b0e",
      live: "#79740e",
      danger: "#9d0006",
      dangerStrong: "#7d0005",
      dangerSoft: "#f7e0da",
      gold: "#b57614",
      goldSoft: "#f0e2be",
      shadow: "rgba(60, 56, 54, 0.16)",
    },
  },
  "rose-pine-dawn": {
    label: "Rosé Pine Dawn",
    dark: false,
    swatch: ["#d7827e", "#907aa9", "#faf4ed"],
    tokens: {
      bg: "#faf4ed",
      stage: "#f9f2ea",
      bar: "#fffaf3",
      panel: "#fffaf3",
      paper: "#fffdf9",
      inset: "#f2e9e1",
      soft: "#f6eee7",
      hover: "#f2e9e1",
      text: "#575279",
      muted: "#797593",
      faint: "#9893a5",
      border: "#dfdad9",
      hairline: "#e9e3e1",
      accent: "#d7827e",
      accentText: "#ffffff",
      accentSoft: "#f4e1dd",
      accentStrong: "#b4637a",
      accentBorder: "#e2b7b2",
      primary: "#d7827e",
      primaryHover: "#c06b67",
      live: "#56949f",
      danger: "#b4637a",
      dangerStrong: "#98526a",
      dangerSoft: "#f7e3e0",
      gold: "#ea9d34",
      goldSoft: "#f8ecd6",
      shadow: "rgba(87, 82, 121, 0.16)",
    },
  },
  porcelain: {
    label: "Porcelain",
    dark: false,
    swatch: ["#4f6bed", "#2d9cdb", "#f6f7fb"],
    tokens: {
      bg: "#f6f7fb",
      stage: "#f4f6fb",
      bar: "#ffffff",
      panel: "#ffffff",
      paper: "#fdfdff",
      inset: "#eef1f7",
      soft: "#f7f9fc",
      hover: "#eef1f7",
      text: "#18212f",
      muted: "#657084",
      faint: "#8a94a6",
      border: "#dce1ea",
      hairline: "#e6eaf2",
      accent: "#4f6bed",
      accentText: "#ffffff",
      accentSoft: "#e6ebfb",
      accentStrong: "#3c55c8",
      accentBorder: "#b3c0ee",
      primary: "#4f6bed",
      primaryHover: "#3c55c8",
      live: "#067647",
      danger: "#d92d20",
      dangerStrong: "#b42318",
      dangerSoft: "#fbe9e7",
      gold: "#b54708",
      goldSoft: "#fdf0e4",
      shadow: "rgba(24, 33, 47, 0.14)",
    },
  },
};

export const THEME_LIST = Object.entries(THEMES).map(([key, entry]) => ({
  key,
  ...entry,
}));

export function themeEntry(key: string | undefined): ThemeEntry {
  return (key && THEMES[key]) || THEMES[DEFAULT_DARK_THEME];
}

const TOKEN_VARS: Record<keyof ThemeTokens, string> = {
  bg: "--th-bg",
  stage: "--th-stage",
  bar: "--th-bar",
  panel: "--th-panel",
  paper: "--th-paper",
  inset: "--th-inset",
  soft: "--th-soft",
  hover: "--th-hover",
  text: "--th-text",
  muted: "--th-muted",
  faint: "--th-faint",
  border: "--th-border",
  hairline: "--th-hairline",
  accent: "--th-accent",
  accentText: "--th-accent-text",
  accentSoft: "--th-accent-soft",
  accentStrong: "--th-accent-strong",
  accentBorder: "--th-accent-border",
  primary: "--th-primary",
  primaryHover: "--th-primary-hover",
  live: "--th-live",
  danger: "--th-danger",
  dangerStrong: "--th-danger-strong",
  dangerSoft: "--th-danger-soft",
  gold: "--th-gold",
  goldSoft: "--th-gold-soft",
  shadow: "--th-shadow",
};

/**
 * 应用主题：把 token 写成根元素上的 CSS 变量。
 * 组件与样式只消费变量，因此新增一套主题只需要在 THEMES 里加一条记录。
 */
export function applyTheme(key: string): void {
  const entry = themeEntry(key);
  const style = document.documentElement.style;
  for (const [token, cssVar] of Object.entries(TOKEN_VARS)) {
    style.setProperty(cssVar, entry.tokens[token as keyof ThemeTokens]);
  }
  document.documentElement.dataset.theme = key;
  document.documentElement.dataset.appearance = entry.dark ? "dark" : "light";
  document.documentElement.style.setProperty(
    "color-scheme",
    entry.dark ? "dark" : "light",
  );
}

export function themeLabel(key: string | undefined): string {
  return key && THEMES[key] ? THEMES[key].label : "静读 · 墨绿";
}
