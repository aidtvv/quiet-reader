import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeEntries, parseLemmaFile } from "./lib/normalize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".scratch", "dicts");
const OUT = path.join(ROOT, "public", "plugins");

const QWERTY_REPO = "RealKai42/qwerty-learner";
const ECDICT_REPO = "skywind3000/ECDICT";
const QWERTY_SOURCE = "https://github.com/RealKai42/qwerty-learner";
const WORDLIST_LICENSE = "GPL-3.0（词表版权归原出版方，仅供个人学习）";

const PLUGINS = [
  {
    id: "kaoyan-hongbaoshu-2025",
    name: "考研红宝书 2025",
    file: "2025KaoYanHongBaoShu.json",
    description: "2025 考研英语红宝书词汇",
    defaultEnabled: true,
  },
  {
    id: "kaoyan-hongbaoshu-2026",
    name: "考研红宝书 2026",
    file: "hongbaoshu-2026.json",
    description: "2026 考研英语红宝书词汇",
  },
  {
    id: "cet4",
    name: "大学英语四级",
    file: "CET4_T.json",
    description: "CET-4 大纲词汇",
  },
  {
    id: "cet6",
    name: "大学英语六级",
    file: "CET6_T.json",
    description: "CET-6 大纲词汇",
  },
  {
    id: "ielts",
    name: "雅思",
    file: "IELTS_3_T.json",
    description: "IELTS 核心词汇",
  },
  {
    id: "toefl",
    name: "托福",
    file: "TOEFL_3_T.json",
    description: "TOEFL 核心词汇",
  },
  {
    id: "gre",
    name: "GRE",
    file: "GRE_3_T.json",
    description: "GRE 核心词汇",
  },
];

async function readCache(file) {
  try {
    const stat = await fs.stat(path.join(CACHE, file));
    if (!stat.size) return null;
    return await fs.readFile(path.join(CACHE, file), "utf8");
  } catch {
    return null;
  }
}

async function download(repo, repoPath, cacheName) {
  const cached = await readCache(cacheName);
  if (cached) return cached;

  const url = `https://api.github.com/repos/${repo}/contents/${repoPath}?ref=master`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.raw",
      "User-Agent": "quiet-reader-build",
    },
  });
  if (!response.ok) {
    throw new Error(
      `下载 ${repo}/${repoPath} 失败：${response.status} ${response.statusText}`,
    );
  }
  const text = await response.text();
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(path.join(CACHE, cacheName), text);
  return text;
}

function countMatchable(entries) {
  return entries.filter((entry) => !entry.name.includes(" ")).length;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const plugins = [];
  const allHeadwords = new Set();
  let totalEntries = 0;

  for (const spec of PLUGINS) {
    process.stdout.write(`· ${spec.name} ... `);
    const rawText = await download(
      QWERTY_REPO,
      `public/dicts/${spec.file}`,
      spec.file,
    );
    const raw = JSON.parse(rawText);
    if (!Array.isArray(raw)) {
      throw new Error(`${spec.file} 不是数组`);
    }

    const entries = normalizeEntries(raw);
    if (!entries.length) {
      throw new Error(`${spec.file} 没有可用词条`);
    }

    for (const entry of entries) allHeadwords.add(entry.name.toLowerCase());

    await fs.writeFile(
      path.join(OUT, `${spec.id}.json`),
      JSON.stringify(entries),
    );

    const meta = {
      id: spec.id,
      name: spec.name,
      type: "wordlist",
      description: spec.description,
      wordCount: raw.length,
      matchableCount: countMatchable(entries),
      source: QWERTY_SOURCE,
      license: WORDLIST_LICENSE,
      file: `${spec.id}.json`,
      defaultEnabled: Boolean(spec.defaultEnabled),
    };
    plugins.push(meta);
    totalEntries += entries.length;
    console.log(`${raw.length} 条 → ${entries.length} 条`);
  }

  process.stdout.write("· 词形还原表 ... ");
  const lemmaText = await download(
    ECDICT_REPO,
    "lemma.en.txt",
    "lemma.en.txt",
  );
  const lemmaMap = parseLemmaFile(lemmaText, allHeadwords);
  await fs.writeFile(path.join(OUT, "lemma.json"), JSON.stringify(lemmaMap));
  console.log(`${Object.keys(lemmaMap).length} 条映射`);

  const manifest = { version: 1, plugins };
  await fs.writeFile(
    path.join(OUT, "plugins.json"),
    JSON.stringify(manifest, null, 2),
  );

  const readme = [
    "# 内置词表来源",
    "",
    "## 词表插件",
    "",
    `- 来源：${QWERTY_SOURCE}`,
    `- 许可：仓库 GPL-3.0；词表本身版权归原出版方，仅供个人学习使用。`,
    `- 插件：${plugins.map((plugin) => plugin.name).join("、")}`,
    `- 词条总数：${totalEntries}`,
    "",
    "## 词形还原",
    "",
    `- 来源：https://github.com/${ECDICT_REPO}/blob/master/lemma.en.txt`,
    "- 许可：文件声明可用于研究/教育用途。",
  ].join("\n");
  await fs.writeFile(path.join(OUT, "README.md"), readme);

  console.log(
    `\n完成：${plugins.length} 个插件，${totalEntries} 条词条，` +
      `${Object.keys(lemmaMap).length} 条词形映射。`,
  );
}

main().catch((error) => {
  console.error(`\n构建失败：${error.message}`);
  process.exitCode = 1;
});
