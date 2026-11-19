/**
 * 统计一本 epub 覆盖了多少词表单词（去重 + 出现频次）。
 * 用法：node scripts/coverage.cjs <epub路径> [插件id...]
 * 匹配规则与 src/lib/dict.ts 的 lookup 一致：精确匹配优先，其次 lemma.json 词形还原。
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const ROOT = path.resolve(__dirname, "..");
const PLUGIN_DIR = path.join(ROOT, "public", "plugins");

const WORD_PATTERN = /[A-Za-z][A-Za-z'’-]*/g;
const MAX_PHRASE_TOKENS = 4;

function normalizeWord(raw) {
  return raw
    .toLowerCase()
    .replace(/[’']s$/, "")
    .replace(/^[’']+|[’']+$/g, "");
}

function tokenize(text) {
  return [...text.matchAll(WORD_PATTERN)].map((m) => normalizeWord(m[0]));
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** 与应用一致：读取 src/lib/basicWords.ts 里的 A1–A2 基础词表。 */
function loadBasicWords() {
  const source = fs.readFileSync(path.join(ROOT, "src", "lib", "basicWords.ts"), "utf8");
  const body = (source.split("`")[1] || "").split(/\s+/);
  return new Set(body.map((word) => word.trim().toLowerCase()).filter(Boolean));
}

function buildIndex(pluginIds) {
  const byWord = new Map();
  const phrases = new Map();
  let maxPhraseTokens = 0;
  for (const id of pluginIds) {
    const entries = loadJson(path.join(PLUGIN_DIR, `${id}.json`));
    for (const entry of entries) {
      const name = entry.name && entry.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const tokens = key.split(/\s+/).filter(Boolean);
      if (tokens.length > 1) {
        if (tokens.length > MAX_PHRASE_TOKENS) continue;
        const phrase = tokens.join(" ");
        if (!phrases.has(phrase)) phrases.set(phrase, { name, lists: [] });
        phrases.get(phrase).lists.push(id);
        maxPhraseTokens = Math.max(maxPhraseTokens, tokens.length);
      } else {
        const norm = normalizeWord(key);
        if (!byWord.has(norm)) byWord.set(norm, { name, lemma: norm, lists: [] });
        byWord.get(norm).lists.push(id);
      }
    }
  }
  const raw = loadJson(path.join(PLUGIN_DIR, "lemma.json"));
  const lemmaMap = {};
  for (const [from, to] of Object.entries(raw)) lemmaMap[from.toLowerCase()] = to.toLowerCase();
  return { byWord, phrases, maxPhraseTokens, lemmaMap };
}

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&[a-z]+;/gi, " ");
}

function bodyText(html) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const scope = body ? body[1] : html;
  return decodeEntities(
    scope.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "),
  );
}

async function readSpine(zip) {
  const opfPath = Object.keys(zip.files).find((f) => f.toLowerCase().endsWith(".opf"));
  if (!opfPath) return Object.keys(zip.files).filter((f) => /\.x?html?$/i.test(f));
  const opf = await zip.file(opfPath).async("string");
  const dir = path.posix.dirname(opfPath);
  const ids = {};
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = (m[0].match(/\bid="([^"]+)"/) || [])[1];
    const href = (m[0].match(/\bhref="([^"]+)"/) || [])[1];
    if (id && href) ids[id] = path.posix.normalize(path.posix.join(dir, href));
  }
  const spine = [];
  const spineBlock = (opf.match(/<spine\b[\s\S]*?<\/spine>/i) || [])[0] || "";
  for (const m of spineBlock.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/gi)) {
    if (ids[m[1]]) spine.push(ids[m[1]]);
  }
  if (spine.length) return spine;
  return Object.keys(zip.files).filter((f) => /\.x?html?$/i.test(f));
}

function coverage(index, hits) {
  const matched = new Map();
  let totalHits = 0;
  for (const [token, count] of hits) {
    let entry = index.byWord.get(token) || index.phrases.get(token);
    if (!entry) {
      const lemma = index.lemmaMap[token];
      if (lemma) entry = index.byWord.get(lemma) || index.phrases.get(lemma);
    }
    if (!entry) continue;
    totalHits += count;
    const current = matched.get(entry.name) || { lemma: entry.lemma, hits: 0 };
    current.hits += count;
    matched.set(entry.name, current);
  }
  return { matched, totalHits };
}

async function main() {
  const [epubPath, ...requested] = process.argv.slice(2);
  if (!epubPath) {
    console.error("用法：node scripts/coverage.cjs <epub路径> [插件id...]");
    process.exit(1);
  }
  const ids = requested.length ? requested : ["cet4", "cet6", "kaoyan-hongbaoshu-2025"];

  const zip = await JSZip.loadAsync(fs.readFileSync(epubPath));
  const files = await readSpine(zip);
  const hits = new Map();
  let totalTokens = 0;
  let docs = 0;

  for (const file of files) {
    const item = zip.file(file);
    if (!item) continue;
    const html = await item.async("string");
    const tokens = tokenize(bodyText(html));
    if (!tokens.length) continue;
    docs += 1;
    totalTokens += tokens.length;
    for (const token of tokens) hits.set(token, (hits.get(token) || 0) + 1);
  }

  const unique = hits.size;
  console.log(`文件：${path.basename(epubPath)}`);
  console.log(`章节：${docs} 个文档 · 词次：${totalTokens} · 去重词形：${unique}`);
  console.log("");

  for (const id of ids) {
    const index = buildIndex([id]);
    const size = index.byWord.size + index.phrases.size;
    const { matched, totalHits } = coverage(index, hits);
    const rate = ((matched.size / size) * 100).toFixed(1);
    console.log(`[${id}] 词表 ${size} 词 · 全书出现 ${matched.size} 词（覆盖 ${rate}%）· 共 ${totalHits} 词次 · 未出现 ${size - matched.size} 词`);
  }

  // 主词表（最后一个参数，默认 CET-6）的明细
  const mainId = ids.includes("cet6") ? "cet6" : ids[ids.length - 1];
  const main = buildIndex([mainId]);
  const { matched } = coverage(main, hits);
  const basic = loadBasicWords();
  const isBasic = (word) => basic.has(word.lemma) || basic.has(word.name.toLowerCase());
  const all = [...matched.entries()]
    .map(([name, v]) => ({ name, hits: v.hits, lemma: v.lemma }))
    .sort((a, b) => b.hits - a.hits);
  const basicCount = all.filter(isBasic).length;
  const basicHits = all.filter(isBasic).reduce((sum, word) => sum + word.hits, 0);
  // 与应用「基础词过滤」一致：the / a / of 这类词不计入学习量。
  const inBook = all.filter((word) => !isBasic(word));
  const size = main.byWord.size + main.phrases.size;

  console.log("");
  console.log(
    `--- ${mainId} 剔除基础词（A1–A2）后：出现 ${inBook.length} 词 · ` +
      `覆盖 ${((inBook.length / size) * 100).toFixed(1)}% · ` +
      `共 ${all.reduce((sum, w) => sum + w.hits, 0) - basicHits} 词次 —— ` +
      `另有 ${basicCount} 个基础词（${basicHits} 词次）已忽略 ---`,
  );

  const buckets = [
    ["≥10 次", (n) => n >= 10],
    ["5–9 次", (n) => n >= 5 && n < 10],
    ["3–4 次", (n) => n >= 3 && n < 5],
    ["2 次", (n) => n === 2],
    ["1 次", (n) => n === 1],
  ];
  const allHits = inBook.reduce((sum, word) => sum + word.hits, 0);
  console.log("");
  console.log(`--- ${mainId} 出现词频分布（剔除基础词） ---`);
  console.log(
    buckets
      .map(([label, test]) => {
        const words = inBook.filter((word) => test(word.hits));
        const share = words.reduce((sum, word) => sum + word.hits, 0);
        return `${label}: ${words.length} 词（占词次 ${((share / allHits) * 100).toFixed(1)}%）`;
      })
      .join(" · "),
  );

  console.log("");
  console.log(`--- ${mainId} 出现频次最高的 30 词（剔除基础词） ---`);
  console.log(inBook.slice(0, 30).map((w) => `${w.name}(${w.hits})`).join(", "));

  console.log("");
  console.log(`--- ${mainId} 未在本书出现的前 40 词 ---`);
  const missing = [...main.byWord.values()]
    .filter((e) => !matched.has(e.name))
    .map((e) => e.name)
    .sort();
  console.log(missing.slice(0, 40).join(", "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
