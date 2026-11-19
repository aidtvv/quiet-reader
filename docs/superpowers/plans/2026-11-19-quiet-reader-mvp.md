# Quiet Reader 最小可用系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把静态原型改造成可导入 epub、按词表插件高亮、按天记生词、可导出 Anki TSV 的外刊精读器。

**Architecture:** 前端解析 epub（JSZip + DOMParser），词表插件以静态 JSON 放在 `public/plugins/`，运行时构建词表索引 + ECDICT lemma 还原来标记正文；状态用 localStorage（生词本/设置）与 IndexedDB（最近书籍）持久化。不改 Rust 侧。

**Tech Stack:** Tauri v2、React 19、TypeScript、Vite、JSZip、Vitest + jsdom。

**Spec:** `docs/superpowers/specs/2026-11-19-quiet-reader-mvp-design.md`

## Global Constraints

- 项目**不是 git 仓库**：不执行 `git init` / `git commit`；每个任务用测试或构建作为检查点。
- 不新增 Tauri command、不改 Rust 代码、不引入网络请求（运行期完全离线）。
- 文案、颜色、字体沿用现有 `src/styles.css`；不重做视觉。
- 所有内置词表必须标注 `source` 与 `license`。
- 用户可见词数展示 `matchableCount`，不是原始 `wordCount`。
- 验收书：`D:\Downloads\TheEconomist.2026.11.14.epub`，预期 19 个板块、76 篇文章。

## Review Focus

1. 重新导入同一 epub 时，书签仍能对上；生词本不重复、不丢上下文。
2. 正文含实体（`&amp;`）、弯引号、连字符、所有格时，高亮不能吞字或拆坏标签。
3. 一个词同时属于多份词表、又同时是「已认识 / 生词本」时，只呈现一种一致状态。
4. 损坏或非 epub 文件要显示可读错误，不能白屏或抛未捕获异常。
5. 短语与相邻标点：`according to,`、`per cent.` 不能把标点吞进点击目标，原句要完整。

---

### Task 1: 测试基建与字典构建脚本

**Files:**
- Modify: `package.json`
- Create: `src/types.ts`（共享类型，后续任务只增不改）
- Create: `vitest.config.ts`
- Create: `scripts/lib/normalize.mjs`
- Create: `scripts/build-plugins.mjs`
- Test: `scripts/lib/normalize.test.ts`
- Create: `public/plugins/`（生成物）

**Interfaces:**
- Produces: `expandHeadword(name: string): string[]`、`normalizeEntries(raw: RawEntry[]): WordListEntry[]`、`parseLemmaFile(text: string, headwords: Set<string>): Record<string,string>`
- Produces 生成物：`public/plugins/plugins.json`、`public/plugins/<id>.json`、`public/plugins/lemma.json`

- [ ] **Step 1: 安装依赖并加测试脚本**

Run:
```bash
npm install jszip
npm install -D vitest jsdom
```
`package.json` scripts 增加 `"test": "vitest run"`、`"test:watch": "vitest"`。

- [ ] **Step 2: 写失败测试**

`scripts/lib/normalize.test.ts` 覆盖：
```ts
expect(expandHeadword("enrol(l)")).toEqual(["enrol", "enroll"]);
expect(expandHeadword("honour/honor")).toEqual(["honour", "honor"]);
expect(expandHeadword("among(st)")).toEqual(["among", "amongst"]);
expect(expandHeadword("according to")).toEqual(["according to"]);
```
以及 `normalizeEntries` 对小写重复去重、合并释义，`parseLemmaFile` 跳过注释行、`perceived/… -> …` 生成 `perceived → perceive`。

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run scripts/lib/normalize.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 `scripts/lib/normalize.mjs`**

规则：括号变体生成「去掉括号」与「展开括号」两种；`/` 变体两侧都保留；至少一个字母才拆；`matchable = !name.includes(" ")`。lemma 只保留「变形不是词头、且 lemma 是词头」的映射。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run scripts/lib/normalize.test.ts`
Expected: PASS。

- [ ] **Step 6: 写 `scripts/build-plugins.mjs` 并生成数据**

从 `https://api.github.com/repos/RealKai42/qwerty-learner/contents/public/dicts/<file>?ref=master`（`Accept: application/vnd.github.raw`）取：
`2025KaoYanHongBaoShu.json`、`hongbaoshu-2026.json`、`CET4_T.json`、`CET6_T.json`、`IELTS_3_T.json`、`TOEFL_3_T.json`、`GRE_3_T.json`；
从 `skywind3000/ECDICT` 取 `lemma.en.txt`。
缓存到 `.scratch/dicts/`，重复运行优先读缓存。输出插件文件与清单；每个插件写 `wordCount`、`matchableCount`、`source`、`license`。

Run:
```bash
node scripts/build-plugins.mjs
node -e "const p=require('./public/plugins/plugins.json'); console.log(p.plugins.map(x=>[x.id,x.wordCount,x.matchableCount]))"
```
Expected: 7 个插件；红宝书 2025 的 `wordCount` 为 6705。

- [ ] **Step 7: 跑全量测试与构建**

Run: `npm test && npm run build`
Expected: PASS；`tsc` 无错。

---

### Task 2: 共享类型与本地存储

**Files:**
- Modify: `src/types.ts`（如需补充索引/设置类型）
- Create: `src/lib/store.ts`
- Create: `src/lib/wordbook.ts`
- Test: `src/lib/wordbook.test.ts`

**Interfaces:**
- Produces: `WordEntry`、`Bookmark`、`Settings`、`PluginMeta`、`WordListEntry`（严格按 spec §10）
- Produces: `loadSettings(): Settings`、`saveSettings(s)`、`loadWordbook(): Record<string, WordEntry>`、`saveWordbook`、`loadKnown(): Set<string>`、`saveKnown`、`loadBookmarks/saveBookmarks`、`loadCustomPlugins/saveCustomPlugins`
- Produces: `addWord(map, entry): Record<string, WordEntry>`（同 lemma 幂等）、`removeWord`、`toggleKnown(set, lemma)`、`groupByDay(entries, now)`、`todayLabel(day, now)`
- Produces IndexedDB：`saveBook({bookId,fileName,bytes,meta,lastArticleId,scrollTop})`、`listBooks()`、`getBook(id)`、`deleteBook(id)`、`pruneBooks(max=5)`

- [ ] **Step 1: 写失败测试（wordbook 纯函数）**

覆盖：同日添加到同一组；跨本地午夜分成两组；`addWord` 第二次只更新 sentence、保留 `addedAt`；`toggleKnown` 可逆。

- [ ] **Step 2: 运行测试确认失败** → `npx vitest run src/lib/wordbook.test.ts`，Expected FAIL。

- [ ] **Step 3: 实现 `src/lib/wordbook.ts` 与 `src/types.ts`**

日期分组用本地 `getFullYear/getMonth/getDate` 拼 `YYYY-MM-DD`；今天/昨天用同一函数比较。

- [ ] **Step 4: 实现 `src/lib/store.ts`**

localStorage key 按 spec §10；读写 `JSON.parse` 失败时回退默认值。IndexedDB 用原生 API，数据库 `qr-books`、store `books`、主键 `bookId`；`pruneBooks` 按 `savedAt` 淘汰。

- [ ] **Step 5: 运行测试与构建** → `npm test && npm run build`，Expected PASS。

---

### Task 3: epub 解析

**Files:**
- Create: `src/lib/epub.ts`
- Test: `src/lib/epub.test.ts`

**Interfaces:**
- Consumes: `src/types.ts` 的 `ParsedBook` / `ArticleRef` / `LoadedArticle`
- Produces:
```ts
export async function hashBytes(data: ArrayBuffer): Promise<string>;
export async function openEpub(data: ArrayBuffer, fileName: string): Promise<EpubSource>;
export type EpubSource = {
  book: ParsedBook;
  loadSection(href: string): Promise<{ title: string; articles: { href: string; title: string }[] }>;
  loadArticle(href: string): Promise<LoadedArticle>;
  close(): void;
};
```
- `ParsedBook = { bookId, title, issueDate?, sections: BookSection[] }`
- `LoadedArticle = { ref, html, plainText, excerpt, images: Record<string,string> }`

- [ ] **Step 1: 写失败测试（合成 epub）**

在测试里用 JSZip 生成一个最小 epub：`mimetype`、`META-INF/container.xml`、`content.opf`、`nav.xhtml`（含 1 个板块 + 2 篇文章链接）、2 个文章 xhtml。断言：
- 解析出 1 个板块、2 篇文章，标题正确；
- `loadArticle` 移除 `<script>`、保留 `<p>`、图片 `src` 变成 `blob:`；
- `plainText` 含正文文字；
- 传入非法字节时 reject，错误信息含「epub」。

- [ ] **Step 2: 运行测试确认失败** → Expected FAIL。

- [ ] **Step 3: 实现 `src/lib/epub.ts`**

解析顺序按 spec §7：container → OPF manifest/spine → EPUB3 nav → NCX → `book_toc.html`。The Economist 专用：section index 的 `li > a`；文章标题取 `h1.te_article_title`，无则 `<title>`。通用兜底按 spine 每文件一篇。图片用 `zip.file(...).async("blob")` + `URL.createObjectURL`，同一 href 缓存。

- [ ] **Step 4: 运行测试确认通过** → Expected PASS。

- [ ] **Step 5: 用真实 epub 做一次快速验证**

Run:
```bash
node -e "console.log('manual check in Task 9')"
```
（真实文件在浏览器/Tauri 里验收，Task 9 执行。）

---

### Task 4: 词表索引与查词

**Files:**
- Create: `src/lib/dict.ts`
- Test: `src/lib/dict.test.ts`

**Interfaces:**
- Consumes: `PluginMeta`、`WordListEntry`
- Produces:
```ts
export type DictEntry = { lemma: string; entry: WordListEntry; lists: string[] };
export type DictIndex = {
  byWord: Map<string, DictEntry>;
  phrases: Map<string, DictEntry>;   // key = 小写短语
  maxPhraseTokens: number;           // 2..4
};
export function buildIndex(
  lists: { meta: PluginMeta; entries: WordListEntry[] }[],
  lemmaMap: Record<string, string>
): DictIndex;
export function lookup(index: DictIndex, raw: string): DictEntry | null; // 精确 → lemma → 去所有格
export function analyzeText(index: DictIndex, text: string): number;      // 去重 lemma 数
export function loadPluginData(meta: PluginMeta, baseUrl?: string): Promise<WordListEntry[]>;
```

- [ ] **Step 1: 写失败测试**

覆盖：精确命中；`perceived` 经 lemma 命中 `perceive`；`companies` 命中 `company`；`they` 精确命中时不被还原成 `he`；同一词在多份词表时 `lists` 含多个 id；`according to` 进入 `phrases`；`analyzeText` 去重且短语计 1。

- [ ] **Step 2: 运行测试确认失败** → Expected FAIL。

- [ ] **Step 3: 实现 `src/lib/dict.ts`**

`buildIndex`：先精确写 `byWord`，同 lemma 合并 `lists`；`lemmaMap` 只用于未精确命中的词；含空格的词条进 `phrases`，`maxPhraseTokens` 取最大值（上限 4）。`lookup` 顺序：小写 → 去 `'s` → 精确 → lemma → 精确（对 lemma 结果）。

- [ ] **Step 4: 运行测试确认通过** → Expected PASS。

- [ ] **Step 5: 构建检查** → `npm run build`。

---

### Task 5: 正文高亮与上下文

**Files:**
- Create: `src/lib/highlight.ts`
- Test: `src/lib/highlight.test.ts`

**Interfaces:**
- Consumes: `DictIndex`、`DictEntry`
- Produces:
```ts
export type HighlightState = {
  index: DictIndex;
  known: Set<string>;
  saved: Set<string>;
};
export function renderArticleHtml(rawHtml: string, state: HighlightState): string;
export function sentenceAround(node: Element): string;
export function wordFromTarget(target: Element): string | null;
```

- [ ] **Step 1: 写失败测试（jsdom）**

覆盖：
- `Companies are sustaining growth.` → `Companies` 的 `data-w="company"`、`sustaining` 的 `data-w="sustain"`；
- `according to,` → 短语一个 span，逗号留在 span 外；
- `company's` → `data-w="company"`，显示文本不改；
- `<script>` 被移除，`&amp;` 保留为 `&`；
- 已认识词不加 `hit` 类；生词本词加 `saved` 类；同时「已认识」且在生词本时，以已认识为准（无 `hit`，保留 `saved` 徽标）；
- `sentenceAround` 返回完整句子。

- [ ] **Step 2: 运行测试确认失败** → Expected FAIL。

- [ ] **Step 3: 实现 `src/lib/highlight.ts`**

先用 `DOMParser` 清洗（白名单 `p/h1-h4/img/blockquote/hr/ul/ol/li/em/strong/i/b/a`，去掉属性只留 `href/src/class`），再只遍历 `p/li/blockquote` 的文本节点；同一节点内先短语最长匹配、再单词匹配；生成 span 精确到有字母的片段，标点留在外面。

- [ ] **Step 4: 运行测试确认通过** → Expected PASS。

- [ ] **Step 5: 构建检查** → `npm run build`。

---

### Task 6: Anki 导出

**Files:**
- Create: `src/lib/anki.ts`
- Test: `src/lib/anki.test.ts`

**Interfaces:**
- Consumes: `WordEntry`
- Produces: `toAnkiTsv(entries: WordEntry[]): string`、`downloadText(filename: string, content: string, mime?: string): void`

- [ ] **Step 1: 写失败测试**

断言：首行为 `Word\tPhonetic\tMeaning\tContext\tSource\tAdded`；多释义用 `<br>`；字段内 `\t`/换行替换为空格；`Source` 为 `期号 · 板块 · 文章标题`；输出不以 BOM（`﻿`）开头。

- [ ] **Step 2: 运行测试确认失败** → Expected FAIL。

- [ ] **Step 3: 实现 `src/lib/anki.ts`**

- [ ] **Step 4: 运行测试确认通过** → Expected PASS。

---

### Task 7: 应用外壳、导入与恢复

**Files:**
- Create: `src/components/Welcome.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`（仅样式）
- Modify: `src/styles.css`（欢迎页、错误提示、索引进度）

**Interfaces:**
- Consumes: `openEpub`、`hashBytes`、`saveBook/listBooks/getBook`、`loadPluginData/buildIndex`
- Produces: `App` 状态：`source | null`、`book | null`、`article | null`、`index | null`、`pluginMeta[]`、`enabledPlugins: Set<string>`、`articleIndex: Map<href, {excerpt,count}>`、`error: string | null`
- Produces: `<input type="file" accept=".epub">` + 拖拽；启动时恢复最近书；解析失败显示错误横幅

- [ ] **Step 1: 写 `Welcome` 组件（无测试，构建验证）**

包含标题、说明、打开按钮、拖拽区、最近 5 本列表（标题 + 时间）、词库入口占位。

- [ ] **Step 2: 改写 `App.tsx` 的导入流程**

`openFile(file)`：读 ArrayBuffer → `hashBytes` → `openEpub` → `saveBook` → 设置 `source/book` → 启动后台索引（遍历 sections 的 href，`loadArticle` 取 `plainText`，`analyzeText` 计数，写 `articleIndex`，每 5 篇让出一次事件循环）。错误时 `setError`，不抛出。

- [ ] **Step 3: 启动恢复**

挂载时 `listBooks()`；有记录则读第一本，`openEpub` + 恢复 `lastArticleId`/`scrollTop`；失败静默回欢迎页。

- [ ] **Step 4: 验证**

Run: `npm test && npm run build`
Expected: PASS。浏览器 `npm run dev` 打开后能看到欢迎页，选择真实 epub 后左侧出现 19 个板块、索引进度推进。

---

### Task 8: 阅读器与查词面板

**Files:**
- Rewrite: `src/components/Reader.tsx`
- Rewrite: `src/components/WordPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`（高亮态、面板按钮）

**Interfaces:**
- Consumes: `renderArticleHtml`、`wordFromTarget`、`sentenceAround`、`lookup`、`WordEntry`
- Reader props: `articleHtml`、`highlightState`、`onSelectWord(word, sentence)`、`onScroll(position)`
- WordPanel props: `hit: DictEntry | null`、`surface`、`sentence`、`saved: boolean`、`known: boolean`、`onKnow`、`onUnknown`、`onUnknow`、`onSpeak`、`onClose`

- [ ] **Step 1: 改写 `Reader`**

文章容器 `dangerouslySetInnerHTML`；容器上委托 click：`wordFromTarget` → `sentenceAround` → `onSelectWord`。滚动时保存位置（节流 200ms）。

- [ ] **Step 2: 改写 `WordPanel`**

显示音标、多行释义、词表标签、原句；按钮「认识 / 已认识（点击取消）」「不认识，加入生词本」；生词本状态徽标；未收录词允许加入生词本。

- [ ] **Step 3: 接入 `App` 状态**

`selectWord` 查 `lookup(index, word)`；`handleUnknown` 用 `addWord`；`handleKnown` 用 `toggleKnown`；状态变化后重渲染当前文章 HTML。

- [ ] **Step 4: 验证**

Run: `npm test && npm run build`
手工：打开文章 → 点词 → 面板出现 → 切换认识状态 → 高亮变化。

---

### Task 9: 侧栏四个真实 Tab

**Files:**
- Rewrite: `src/components/OutlinePanel.tsx`
- Create: `src/components/WordbookPanel.tsx`
- Create: `src/components/ArticleCards.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `groupByDay`、`toAnkiTsv`、`downloadText`、`bookmarks`、`articleIndex`
- Produces: `NavTab = "outline" | "cards" | "wordbook" | "bookmarks"`

- [ ] **Step 1: 大纲**

板块折叠 → 文章按钮；搜索过滤标题与板块；当前文章高亮；点击切篇。

- [ ] **Step 2: 文章卡片**

标题、板块、摘要、考研词数；索引未完成显示 `—`；点击切篇。

- [ ] **Step 3: 生词本**

两段「生词本 / 已认识」；按天分组；复选框；全选当天；导出选中 / 全部；删除；点词打开面板。生词本为空时给引导文案。

- [ ] **Step 4: 书签**

当前文章加/取消；按书分组列出；点击切篇；删除。

- [ ] **Step 5: 验证**

Run: `npm test && npm run build`
手工：四个 Tab 均可操作，导出文件出现。

---

### Task 10: 工具栏、词库管理与清理静态数据

**Files:**
- Rewrite: `src/components/Toolbar.tsx`
- Create: `src/components/PluginManager.tsx`
- Delete: `src/data.ts`（移除引用）
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `src-tauri/tauri.conf.json`（窗口标题）

**Interfaces:**
- Produces: `PluginManager` props `{ plugins, enabled, onChange, onImport, customPlugins }`

- [ ] **Step 1: 工具栏**

打开 epub、上一/下一篇、`第 n / 共 N 篇`、缩放、当前文章搜索、护眼、词库、更多（导出 Anki / 导出文章文本）、左栏开关。删除假页码与假边界。底部状态栏显示 `第 n 篇 / 共 N 篇 · 生词本 X 词 · 今日 +M`。

- [ ] **Step 2: 词库管理**

插件列表（名称、可匹配词数、来源、许可、开关）；「查看词表」弹层可搜索全部词条；导入 JSON/CSV（预览前 3 条与词数，确认后存 `qr.customPlugins.v1`）。

- [ ] **Step 3: 清理写死数据**

删除 `ARTICLE`、`LOOKUP`、`SECTION_LIST` 的所有引用；清理无用样式；窗口标题改为 `Quiet Reader · 外刊精读`。

- [ ] **Step 4: 全量验证**

Run: `npm test && npm run build`
Expected: PASS，无 `data.ts` 引用（`grep -r "from \"./data\"\|from \"../data\"" src` 无结果）。

---

### Task 11: 真实 epub 验收与视觉检查

**Files:**
- Modify: 按验收结果修复
- Create: `docs/superpowers/plans/2026-11-19-acceptance.md`（记录结果）

- [ ] **Step 1: 启动开发服务器**

用 `.claude/launch.json` 配置 `npm run dev`（端口 1420），通过浏览器预览打开。

- [ ] **Step 2: 导入真实 epub**

上传 `D:\Downloads\TheEconomist.2026.11.14.epub`；确认左侧 19 板块 / 76 篇；截图。

- [ ] **Step 3: 逐条走验收标准（spec §13 的 13 条）**

重点：红宝书高亮、`companies → company`、短语、认识可逆、生词本按天、TSV 字段、重启恢复、第二本书书签隔离。

- [ ] **Step 4: 记录问题并修复**

每条失败写进验收文档并修复，再重跑 `npm test && npm run build`。

- [ ] **Step 5: Tauri 冒烟（可选）**

Run: `npm run tauri dev`
Expected: 窗口打开、导入与浏览器一致。若环境缺少 Rust/WebView 依赖，记录为未验证，不阻塞。
