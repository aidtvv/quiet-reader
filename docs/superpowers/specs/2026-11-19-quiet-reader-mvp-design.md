# Quiet Reader 最小可用系统 · 设计文档

日期：2026-11-19
状态：待确认

## 1. 一句话

把静态原型 Quiet Reader 变成能真正使用的「外刊精读器」：导入 epub 外刊、按需启用词表插件、正文自动标出命中词、点词看释义、把不会的词按天收进生词本、一键导出 Anki。

## 2. 目标

- 导入本地 `.epub` 文件，解析出「板块 → 文章」结构并阅读。
- 内置多份词表插件（考研红宝书 2025/2026、CET-4/6、雅思、托福、GRE），用户可按需启用/停用；支持从文件导入自定义词表。
- 正文命中词高亮，同一词属于多份词表时能看出归属。
- 词形还原：`perceived → perceive`、`studies → study`，变形词也能命中词表。
- 点词 → 右侧释义面板（音标、中文释义、所属词表、文中原句）。
- 「认识 / 不认识」判断；不认识的进入生词本。
- 生词本按添加日期分组（今天 / 昨天 / 日期）。
- 导出 Anki 可导入的 TSV。
- 左侧「大纲 / 缩略图 / 书签」全部变成真功能。

## 3. 非目标（本期不做）

- 不做账号、云同步、跨设备。
- 不做 `.apkg` 生成、AnkiConnect 直连。
- 不做 PDF / mobi / azw3。
- 不做 Rust 侧文件解析（不新增 Tauri command）。
- 不做机器翻译、整句翻译、AI 释义。
- 不做全文 NLP 词性标注；只做「词表 + 词形还原」。

## 4. 数据源（已核实）

| 数据 | 来源 | 许可 | 用途 |
|---|---|---|---|
| 考研红宝书 2025（6705 词） | `RealKai42/qwerty-learner` → `public/dicts/2025KaoYanHongBaoShu.json` | 仓库 GPL-3.0；词表本身版权归原出版方 | 默认考研词表 |
| 考研红宝书 2026（4858 词） | 同上 → `hongbaoshu-2026.json` | 同上 | 可选词表 |
| CET4 / CET6 / IELTS / TOEFL / GRE | 同上目录各 `*_T.json` | 同上 | 可选词表 |
| 词形还原表（84,487 组 / 186,523 词形） | `skywind3000/ECDICT` → `lemma.en.txt` | 文件声明「free to use for research/education」 | 变形还原 |
| 全量释义（可选，二期） | `skywind3000/ECDICT` → `ecdict.csv` | MIT | 非词表词的兜底查词 |

关于「官方词书源 / 抓包」：

- 考研英语只有官方《考试大纲》词表（纸面发布，无公开 API）；红宝书是商业出版物，无官方开放数据。
- `kajweb/dict`（3.8k stars）现成实现了抓取有道背单词的公开离线包，可作为参考，但无许可证、依赖对方私有 API，不适合作为内置依赖。
- 百词斩 / 墨墨 / 扇贝等 App 的私有接口理论上可抓包，但需要登录态/签名、随时可能变、且通常违反服务条款；本期不作为内置数据源。
- 因此：**内置数据全部来自开源仓库并标注来源与许可；用户自己抓到的词表通过「导入自定义词表」进入系统。**

许可说明：qwerty-learner 为 GPL-3.0，红宝书词表版权归原出版方。本应用定位个人学习工具；若要分发，需在「词库管理 → 插件详情」保留来源与许可，并自行评估合规。

## 5. 插件格式

### 5.1 清单 `public/plugins/plugins.json`

```json
{
  "version": 1,
  "plugins": [
    {
      "id": "kaoyan-hongbaoshu-2025",
      "name": "考研红宝书 2025",
      "type": "wordlist",
      "description": "2025 考研英语红宝书词汇（6705 词）",
      "wordCount": 6705,
      "source": "https://github.com/RealKai42/qwerty-learner",
      "license": "GPL-3.0（词表版权归原出版方）",
      "file": "kaoyan-hongbaoshu-2025.json",
      "defaultEnabled": true
    }
  ]
}
```

`type` 本期只有 `wordlist`；预留 `dictionary`（二期全量释义）。

### 5.2 词表文件

保持 qwerty-learner 原始结构，减少转换风险：

```json
[
  {
    "name": "embrace",
    "trans": ["v. 拥抱，抱；欣然接受，乐于接受；包含，包括", "n. 拥抱"],
    "usphone": "ɪmˈbreɪs",
    "ukphone": "ɪmˈbreɪs"
  }
]
```

构建插件时做两项规范化（`scripts/build-plugins.mjs`）：

- **拼写变体**：`enrol(l)` → `enrol` + `enroll`；`enquire/inquire` → `enquire` + `inquire`；`honour/honor` 同理。拆成独立词条，释义相同。
- **大小写重复**：`Word` / `word` 合并为一条，保留首个释义。
- 清单同时记录 `wordCount`（原始条数）与 `matchableCount`（去掉短语后可按单词命中的条数），界面展示 `matchableCount`，并用 tooltip 说明差异。

**短语词条**：词表中存在 `according to`、`per cent` 这类多词词头。它们保留在词库中可查询；正文匹配做「同一文本节点内 2–4 个 token 的最长匹配」，跨内联标签（如链接）的短语不强制匹配。命中短语时整个短语共用一个点击目标。

### 5.3 词形索引 `public/plugins/lemma.json`

由 `lemma.en.txt` 生成：`{ "perceived": "perceive", "studies": "study", ... }`。
生成规则：只收录「变形词本身不是词表/词典词头」的映射；同一变形有多个候选时取频次最高的词头。查询时**先精确匹配，命中则不再还原**，避免 `they → he` 这类噪声。

### 5.4 自定义词表导入

- 支持 `.json`（上面的数组格式 / `{name,trans,phonetic}` / `{word,translation,phonetic}`）与 `.csv`（列头 `word,translation,phonetic`，UTF-8）。
- 导入后写入 `localStorage` 的自定义插件表，和内置插件一样启用。
- 不做模糊猜测：字段缺失就留空，导入前展示识别到的词数与前 3 条预览。

## 6. 架构

```
src/
  types.ts                 Book / Article / WordEntry / PluginMeta 等类型
  lib/
    epub.ts                JSZip + DOMParser 解析 epub
    dict.ts                插件清单加载、词表索引、lemma 还原、查词
    highlight.ts           正文分词 + 高亮 span 生成
    store.ts               localStorage / IndexedDB 持久化
    anki.ts                TSV 导出
  components/
    Toolbar.tsx            打开文件、翻篇、缩放、搜索、护眼、导出、词库入口
    OutlinePanel.tsx       左侧四个真实 Tab
    Reader.tsx             文章渲染、取词、滚动、当前文章
    WordPanel.tsx          释义 / 认识 / 不认识 / 发音
    PluginManager.tsx      词库插件管理（新增）
    Welcome.tsx            空状态 / 导入引导（新增）
  App.tsx                  全局状态与编排
public/plugins/            内置插件数据
scripts/build-plugins.mjs  （可选）从上游重新生成插件数据
```

不新增 Rust 依赖；epub 在前端用 `jszip` 解析，`npm run dev` 在浏览器里也能完整调试。

## 7. epub 解析

1. `JSZip.loadAsync(file)`。
2. 读 `META-INF/container.xml` → `rootfile full-path`。
3. 解析 OPF：`manifest`（id → href / media-type）、`spine`（阅读顺序）。
4. 目录优先级：EPUB3 `nav`（`properties="nav"`）→ EPUB2 `toc.ncx` → 自定义 `book_toc.html`。
5. The Economist 结构（已实测）：
   - `book_toc.html` 列出 19 个板块链接；
   - 每个板块 index 页是 `<h2 class="section_index_title">` + `<li><a href="文章.html">标题</a>`；
   - 文章页含 `te_section_title` / `te_article_title` / `te_article_rubric` / 正文段落 / 图片。
   - 本期实测结果：19 个板块、76 篇文章。
6. 通用兜底：若没有上述结构，按 spine 顺序把每个 xhtml 当一篇文章，标题取 `<title>` 或第一个 `h1`。
7. 文章正文**按需加载**：点击文章时才从 zip 里取 HTML、抽图片为 Blob URL；解析后缓存到内存。首屏只加载目录。
8. **导入后的后台索引**：目录解析完成后，异步遍历 76 个文章文件，只抽纯文本并计算每篇的摘要（前 80 字）与命中数，写入内存缓存；界面显示「正在索引 12/76」。不阻塞目录展示，索引完成后「缩略图」卡片才有数字。索引只读文本、不解码图片。
9. 清洗：移除 `script/style/link`，只保留 `p/h1-h4/img/blockquote/hr/ul/ol/li/em/strong/i/b/a`；`a` 保留文字；相对链接若指向本刊其他文章，拦截点击并切篇。
10. 持久化：把原始 epub（Blob）与最近阅读位置存进 IndexedDB，下次启动恢复；失败时静默回到欢迎页。

## 8. 正文取词与高亮

- 文章加载后，遍历正文文本节点，用 `/[A-Za-z][A-Za-z'-]*/g` 切词，生成：
  `<span class="w" data-w="lemma" data-lists="kaoyan-hongbaoshu-2025,cet6">word</span>`
- 判定顺序：小写化 → 去所有格（`'s`）→ 精确查启用词表 → 不在则查 lemma 索引后再查词表。
- **短语匹配**：每个文本节点先尝试 2–4 个 token 的最长短语匹配（`according to`、`per cent`），命中则生成 `<span class="w phrase" data-w="according to">`；否则退化为单词匹配。同一文本节点内不重叠，跨节点短语不处理。
- **命中数口径**：卡片与状态栏的「考研词数」= 当前启用词表中命中的**去重 lemma 数**（默认只启用红宝书 2025）。短语按 1 个词条计。
- 高亮只加在当前文章；切换词表/认识状态时从原始 HTML 重新生成（单篇成本可接受）。
- 视觉层级：
  - 命中且未处理：实线下划线 / 淡色底；
  - 已在生词本：暖色点状下划线；
  - 已标「认识」：不加高亮（或极弱）；
  - 同一词属于多份词表：tooltip 与侧栏显示全部标签。
- 点击用事件委托（容器上一个 click），不逐词绑 React 事件，避免 76 篇文章的性能问题。
- 取上下文：点击词所在最近 `p` 的文本，作为「文中语境」。

## 9. 查词面板

数据来源优先级：启用的词表中第一个命中项 → 自定义词表 → 二期全量释义 → 「当前词表未收录」。

展示：单词 / 英式·美式音标 / 所属词表标签 / 中文释义（多行）/ 文中原句 / 发音按钮。
操作：

- **认识**：加入 `known` 集合，取消高亮；再次点击「已认识」可取消，恢复高亮。若词条同时在生词本中，保留生词本条目并显示「已认识」标记（认识状态只影响高亮与默认复习，不删除记录）。
- **不认识**：加入生词本（重复则只更新上下文），并从 `known` 中移除。
- 生词本 Tab 内分两段：**生词本**（未标认识）与**已认识**（可搜、可取消认识）。避免误点后词条「消失」且无处找回。
- **发音**：`speechSynthesis`，优先英音 `en-GB`。
- 未收录词：仍显示原句，并允许手动加入生词本。

## 10. 生词本与持久化

**书籍身份（决定书签/生词来源能否在重新导入后对上）**：`bookId = SHA-256(文件字节)`（`crypto.subtle.digest`），摘要不可用时退回 `${title}|${size}|${issueDate}`。同一文件无论从欢迎页恢复还是重新选择，ID 不变。

**多书边界**：同一时间只打开一本；欢迎页可恢复最近 5 本。**生词本与「已认识」是全局的**（跨书共享，背单词不该按书隔离）；书签按书隔离；每本书各自记住最后文章。

localStorage：

- `qr.wordbook.v1`：`Record<lemma, WordEntry>`（全局）
- `qr.known.v1`：`string[]`（lemma，全局）
- `qr.bookmarks.v1`：`Bookmark[]`（带 `bookId`）
- `qr.settings.v1`：`{ enabledPlugins: string[], zoom, warm, lastBookId, lastArticleByBook: Record<bookId, articleId> }`
- `qr.customPlugins.v1`：自定义词表

```ts
type WordEntry = {
  lemma: string;
  surface: string;        // 首次点击时的原形
  phonetic?: string;
  trans: string[];
  lists: string[];
  sentence?: string;
  bookId?: string;
  bookTitle?: string;     // 期号，如 TheEconomist.2026.11.14
  section?: string;       // 板块，如 Business
  articleId?: string;
  articleTitle?: string;
  addedAt: number;        // epoch ms
};

type Bookmark = {
  id: string;             // `${bookId}:${articleId}`
  bookId: string;
  bookTitle: string;
  section: string;
  articleId: string;
  articleTitle: string;
  createdAt: number;
};
```

IndexedDB：`qr-books` 存最近 5 本 epub 的原始字节（Blob）、元数据、每本最后文章与滚动位置；LRU 淘汰最旧的。不存解析结果，恢复时重新解析。

按天分组：用本地时区把 `addedAt` 格式化为 `YYYY-MM-DD`，顺序为今天 → 昨天 → 更早日期倒序。状态栏显示「生词本 N 词 · 今日 +M」。

## 11. Anki 导出

TSV，UTF-8，无 BOM，制表符分隔，字段内的制表符/换行替换为空格：

```
Word <TAB> Phonetic <TAB> Meaning <TAB> Context <TAB> Source <TAB> Added
```

- `Meaning`：多条释义用 `<br>` 连接。
- `Context`：文中原句。
- `Source`：`期号 · 板块 · 文章标题`（例如 `TheEconomist.2026.11.14 · Business · ...`）。
- 导出范围：当前勾选 / 按天 / 全部。文件名 `quiet-reader-anki-YYYY-MM-DD.tsv`。
- 同时提供「复制到剪贴板」，方便直接粘进 Anki。

## 12. 界面改动

### 欢迎页（无书时）

标题 + 一句话说明 + 「打开 epub」按钮 + 拖拽区域 + 最近打开的书 + 「词库」入口。

### 工具栏

打开 epub · 上一篇/下一篇（第 n / 共 N 篇）· 缩放 · 当前文章搜索 · 护眼 · 词库 · 更多（导出 Anki / 导出文章文本 / 关于）· 左侧栏开关。
删除：假的页码（1 / 1）、假的翻页边界逻辑。

### 左侧栏（真实功能）

- **大纲**：板块可折叠 → 文章列表；搜索过滤；当前文章高亮；点击切篇。
- **缩略图**：改为「文章卡片」——板块、标题、摘要（正文前 80 字）、文中考研词数；点击切篇。不做页面快照。数据来自导入后的后台索引；未索引完成时卡片显示占位，不阻塞阅读。
- **生词本**：分「生词本 / 已认识」两段；按天分组；勾选；批量导出 / 删除；点词打开释义。
- **书签**：当前文章可加书签；列表按书 + 文章分组；点击跳转；可删除。

### 右侧查词面板

保留现有视觉；新增「认识 / 不认识」双按钮、词表标签、生词本状态。移除写死的假搭配字段（改为有数据才显示）。

### 词库管理（弹窗）

内置插件列表（名称、词数、来源、许可、启用开关）；「查看词表」可搜索浏览全部词条；「导入词表」；提示当前启用的词表数量。

## 13. 验收标准

以 `D:\Downloads\TheEconomist.2026.11.14.epub` 验收：

1. 导入后左侧出现 19 个板块、76 篇文章。
2. 打开任意文章，正文正常排版，图片显示。
3. 启用「考研红宝书 2025」后，正文出现高亮词；停用后高亮消失。
4. 词形还原有效：文中 `sustaining / sustained` 能命中 `sustain`（以词表实际收录为准），`companies → company`。
5. 点击高亮词 → 右侧显示音标、释义、所属词表、原句；发音可播放。
6. 点「不认识」→ 生词本出现该词，归入「今天」；重复点击不重复添加。
7. 点「认识」→ 高亮消失；再点「已认识」→ 恢复高亮；「生词本 Tab → 已认识」能找到它。
8. 短语与变体：`according to`、`per cent` 可作为短语命中；`enrol(l)` 的两种拼写都能命中。
9. 「缩略图」卡片索引完成后显示摘要与考研词数；在索引中途切换文章不报错。
10. 生词本勾选后导出 TSV，Anki 能导入且字段正确（制表符未串列），`Source` 含期号。
11. 重启应用：最近的书可恢复，生词本、认识状态、书签仍在；重新导入同一文件，书签仍对应。
12. 开第二本书：生词本仍可见，书签互不混入。
13. 浏览器 `npm run dev` 与 Tauri `npm run tauri dev` 行为一致；`npm run build` 通过（`tsc` 无错）。

## 14. 我的决定（可推翻）

- 缩略图 = 文章卡片（用户已确认方向）。
- 翻页 = 文章级翻篇，不做 PDF 式分页。
- epub 解析放前端，不加 Rust command。
- 首期内置词表来自 qwerty-learner；ECDICT 全量释义二期再加。
- 生词本/认识/书签存 localStorage；原书存 IndexedDB。
- Anki 先 TSV，不做 `.apkg`。
- 保留现有深色排版与字体，不重做视觉。
- 多书：一次读一本，可恢复最近 5 本；生词本/认识全局，书签按书。
- 书籍 ID 用文件 SHA-256，重新导入同一文件不丢书签。
- 「认识」可逆，生词本 Tab 内提供「已认识」段。
- 卡片摘要在导入后后台索引，命中数 = 当前启用词表的去重 lemma 数。
- 短语在同一文本节点内做最长匹配；拼写变体在构建插件时拆分。

## 15. 风险

- **许可**：qwerty-learner GPL-3.0 + 红宝书版权；个人使用无碍，分发需评估。
- **epub 兼容性**：本期针对 The Economist 结构 + 通用兜底；其他出版社的 nav/ncx 需要实测。
- **性能**：单篇文章约数千词，正则在主线程可接受；不做逐词 React 组件。
- **短语与变体**：跨内联标签的短语不做匹配；构建期拆分会增加少量重复词条，清单用 `matchableCount` 如实展示。
- **数据体积**：词表插件合计约 4–6 MB，可接受。
- **IndexedDB 恢复**：WebView2 数据目录被清理时会丢最近书籍，不影响生词本。
