import { useEffect, useState } from "react";
import {
  BookOpen,
  BookMarked,
  Check,
  Database,
  Info,
  Keyboard,
  Moon,
  Palette,
  RotateCcw,
  SunMedium,
} from "lucide-react";
import { THEME_LIST, themeLabel } from "../lib/themes";
import {
  DEFAULT_ANKI_CONNECT_URL,
  DEFAULT_ANKI_TARGET_DECK,
  checkAnkiConnect,
  getAnkiDecks,
  pushTodayWordsToAnki,
  todayWordbookEntries,
} from "../lib/ankiConnect";
import {
  libraryAvailable,
  libraryRoot,
  listLibrary,
} from "../lib/library";
import type { Settings, WordEntry } from "../types";
import { Topbar } from "./Topbar";

type SettingsSection =
  | "reader"
  | "dict"
  | "library"
  | "appearance"
  | "shortcuts"
  | "about";

type SettingsPageProps = {
  settings: Settings;
  wordbook: Record<string, WordEntry>;
  activeTheme: string;
  light: boolean;
  warm: boolean;
  onUpdate: (patch: Partial<Settings>) => void;
  onPickTheme: (key: string) => void;
  onToggleLight: () => void;
  onToggleWarm: () => void;
  onOpenPlugins: () => void;
  onResetDefaults: () => void;
  onBackToShelf: () => void;
  onOpenVocab?: () => void;
  onBackToReader?: () => void;
  onToast: (message: string) => void;
};

const NAV_ITEMS: {
  id: SettingsSection;
  title: string;
  subtitle: string;
  icon: typeof BookOpen;
}[] = [
  { id: "reader", title: "阅读器", subtitle: "字体、字号与排版", icon: BookOpen },
  { id: "dict", title: "词典与取词", subtitle: "词库优先级与发音", icon: BookMarked },
  { id: "library", title: "书库与同步", subtitle: "本地目录与导入规则", icon: Database },
  { id: "appearance", title: "外观与护眼", subtitle: "深色主题与护眼色温", icon: Palette },
  { id: "shortcuts", title: "快捷键", subtitle: "翻页、缩放与搜索", icon: Keyboard },
  { id: "about", title: "关于", subtitle: "Quiet Reader v0.2.4", icon: Info },
];

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`settings-switch${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-switch-thumb" />
    </button>
  );
}

export function SettingsPage({
  settings,
  wordbook,
  activeTheme,
  light,
  warm,
  onUpdate,
  onPickTheme,
  onToggleLight,
  onToggleWarm,
  onOpenPlugins,
  onResetDefaults,
  onBackToShelf,
  onOpenVocab,
  onBackToReader,
  onToast,
}: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>("reader");
  const [ankiDecks, setAnkiDecks] = useState<string[]>([]);
  const [ankiStatus, setAnkiStatus] = useState<string>("");
  const [ankiBusy, setAnkiBusy] = useState(false);
  const [libraryDir, setLibraryDir] = useState<string>("");
  const [libraryCount, setLibraryCount] = useState<number | null>(null);

  useEffect(() => {
    if (!libraryAvailable()) return;
    let cancelled = false;
    void (async () => {
      const [root, books] = await Promise.all([libraryRoot(), listLibrary()]);
      if (cancelled) return;
      setLibraryDir(root ?? "");
      setLibraryCount(books.length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fontFamily = settings.fontFamily ?? "lora";
  const fontSize = settings.fontSize ?? 18;
  const lineHeight = settings.lineHeight ?? 1.75;
  const readerWidth = settings.readerWidth ?? 744;
  const clickLookup = settings.clickLookup ?? true;
  const autoSpeak = settings.autoSpeak ?? false;
  const autoSaveWord = settings.autoSaveWord ?? false;
  const filterBasic = settings.filterBasic ?? true;
  const autoSync = settings.autoSync ?? true;
  const ankiEnabled = settings.ankiConnectEnabled ?? false;
  const ankiUrl = settings.ankiConnectUrl || DEFAULT_ANKI_CONNECT_URL;
  const ankiDeck = settings.ankiDeck || DEFAULT_ANKI_TARGET_DECK;
  const ankiReuseExisting = settings.ankiReuseExisting ?? false;
  const todayCount = todayWordbookEntries(wordbook).length;

  const testAnki = async () => {
    setAnkiBusy(true);
    try {
      const ver = await checkAnkiConnect(ankiUrl);
      const decks = await getAnkiDecks(ankiUrl);
      setAnkiDecks(decks);
      setAnkiStatus(`已连接 AnkiConnect v${ver}（${decks.length} 个牌组）`);
    } catch (err) {
      setAnkiStatus(
        err instanceof Error && err.message
          ? err.message
          : "未检测到 Anki，请确认 Anki 已打开且已安装 AnkiConnect",
      );
    } finally {
      setAnkiBusy(false);
    }
  };

  const syncTodayToAnki = async () => {
    setAnkiBusy(true);
    try {
      const res = await pushTodayWordsToAnki(wordbook, ankiDeck, ankiUrl, {
        reuseExisting: ankiReuseExisting,
        sourceDeck: settings.ankiSourceDeck ?? "",
      });
      if (res.total === 0) {
        onToast("今天还没有新加入生词本的词");
      } else {
        const parts: string[] = [];
        if (res.moved) parts.push(`移入 ${res.moved} 张已有卡片`);
        if (res.added) parts.push(`新建 ${res.added} 张`);
        if (res.already) parts.push(`已在目标牌组 ${res.already} 个`);
        if (res.skipped) parts.push(`跳过重复 ${res.skipped} 张`);
        onToast(
          `已同步到「${ankiDeck}」：${parts.length ? parts.join(" · ") : "没有变化"}`,
        );
      }
    } catch (err) {
      onToast(
        err instanceof Error && err.message
          ? err.message
          : "推送失败：请检查 Anki 是否开启",
      );
    } finally {
      setAnkiBusy(false);
    }
  };

  const darkThemes = THEME_LIST.filter((t) => t.dark);
  const lightThemes = THEME_LIST.filter((t) => !t.dark);

  return (
    <div className="settings-view">
      <Topbar
        nav={[
          { key: "shelf", label: "书架", onClick: onBackToShelf },
          ...(onOpenVocab
            ? [{ key: "vocab", label: "生词本", onClick: onOpenVocab }]
            : []),
          ...(onBackToReader
            ? [{ key: "reader", label: "返回阅读", onClick: onBackToReader }]
            : []),
          { key: "settings", label: "设置", active: true, onClick: () => {} },
        ]}
        right={
          <div className="shelf-tools">
            <button
              className={`shelf-icon${light ? " active" : ""}`}
              type="button"
              title={light ? "切换为深色模式" : "切换为浅色模式"}
              onClick={onToggleLight}
            >
              {light ? (
                <Moon size={19} strokeWidth={1.6} />
              ) : (
                <SunMedium size={19} strokeWidth={1.6} />
              )}
            </button>
          </div>
        }
      />

      <div className="settings-body">
        <aside className="settings-sidebar">
          <div className="settings-sidebar-head">
            <h2>设置</h2>
            <p>偏好与阅读器配置</p>
          </div>
          <nav className="settings-nav" aria-label="设置分类">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`settings-nav-item${active ? " active" : ""}`}
                  onClick={() => setSection(item.id)}
                >
                  <span className="settings-nav-bar" aria-hidden="true" />
                  <Icon size={16} strokeWidth={1.6} className="settings-nav-icon" />
                  <span className="settings-nav-text">
                    <span className="settings-nav-title">{item.title}</span>
                    <span className="settings-nav-sub">{item.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="settings-main">
          {section === "reader" ? (
            <>
              <div className="settings-page-head">
                <div>
                  <h1>阅读器设置</h1>
                  <p>自定义正文排版、翻页方式与外刊精读体验</p>
                </div>
                <button
                  type="button"
                  className="settings-reset-btn"
                  onClick={onResetDefaults}
                >
                  <RotateCcw size={14} strokeWidth={1.6} />
                  恢复默认
                </button>
              </div>

              <div className="settings-group-label">正 文 排 版</div>
              <section className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">正文字体</div>
                    <div className="settings-row-desc">
                      用于英文外刊与长文阅读的衬线字体
                    </div>
                  </div>
                  <select
                    className="settings-select"
                    aria-label="正文字体"
                    value={fontFamily}
                    onChange={(e) =>
                      onUpdate({
                        fontFamily: e.target.value as Settings["fontFamily"],
                      })
                    }
                  >
                    <option value="lora">Lora · 衬线</option>
                    <option value="inter">Inter · 无衬线</option>
                    <option value="system">系统默认字体</option>
                  </select>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">字号大小</div>
                    <div className="settings-row-desc">
                      调整正文基础字号（14 – 24 px）
                    </div>
                  </div>
                  <div className="settings-slider-wrap">
                    <input
                      type="range"
                      min={14}
                      max={24}
                      step={1}
                      value={fontSize}
                      aria-label="字号大小"
                      className="settings-slider"
                      onChange={(e) =>
                        onUpdate({ fontSize: Number(e.target.value) })
                      }
                    />
                    <span className="settings-slider-val">{fontSize} px</span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">行高间距</div>
                    <div className="settings-row-desc">
                      控制段落行与行之间的垂直呼吸感
                    </div>
                  </div>
                  <div className="settings-seg" role="group" aria-label="行高间距">
                    {[
                      { label: "紧凑 1.5", value: 1.5 },
                      { label: "适中 1.75", value: 1.75 },
                      { label: "宽松 2.0", value: 2.0 },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`settings-seg-btn${lineHeight === opt.value ? " active" : ""}`}
                        onClick={() => onUpdate({ lineHeight: opt.value })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">阅读栏宽</div>
                    <div className="settings-row-desc">
                      限制单栏最大宽度以保持最佳阅读视线
                    </div>
                  </div>
                  <select
                    className="settings-select"
                    aria-label="阅读栏宽"
                    value={readerWidth}
                    onChange={(e) =>
                      onUpdate({ readerWidth: Number(e.target.value) })
                    }
                  >
                    <option value={640}>紧凑 · 640 px</option>
                    <option value={744}>标准 · 744 px</option>
                    <option value={880}>宽栏 · 880 px</option>
                  </select>
                </div>
              </section>

              <div className="settings-group-label">阅 读 与 取 词</div>
              <section className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">行内点击取词</div>
                    <div className="settings-row-desc">
                      在正文中单击英文单词即可在右侧面板查词
                    </div>
                  </div>
                  <Switch
                    checked={clickLookup}
                    label="行内点击取词"
                    onChange={(v) => onUpdate({ clickLookup: v })}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">选中单词自动发音</div>
                    <div className="settings-row-desc">
                      查词时自动播放美式 / 英式读音
                    </div>
                  </div>
                  <Switch
                    checked={autoSpeak}
                    label="选中单词自动发音"
                    onChange={(v) => onUpdate({ autoSpeak: v })}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">自动加入生词本</div>
                    <div className="settings-row-desc">
                      首次查询的生词自动收藏到当前书本生词本
                    </div>
                  </div>
                  <Switch
                    checked={autoSaveWord}
                    label="自动加入生词本"
                    onChange={(v) => onUpdate({ autoSaveWord: v })}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">护眼暖色模式</div>
                    <div className="settings-row-desc">
                      降低蓝光对比度，适合夜间长时间精读
                    </div>
                  </div>
                  <Switch
                    checked={warm}
                    label="护眼暖色模式"
                    onChange={onToggleWarm}
                  />
                </div>
              </section>

              <div className="settings-group-label">数 据 与 同 步</div>
              <section className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">阅读进度自动同步</div>
                    <div className="settings-row-desc">
                      实时保存当前页码、滚动位置与笔记高亮
                    </div>
                  </div>
                  <Switch
                    checked={autoSync}
                    label="阅读进度自动同步"
                    onChange={(v) => onUpdate({ autoSync: v })}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">全文搜索快捷键</div>
                    <div className="settings-row-desc">
                      在阅读器中快速呼出全文检索栏
                    </div>
                  </div>
                  <kbd className="settings-kbd">Ctrl + F</kbd>
                </div>
              </section>
            </>
          ) : null}

          {section === "dict" ? (
            <>
              <div className="settings-page-head">
                <div>
                  <h1>词典与取词</h1>
                  <p>管理词表插件、基础词过滤与查词行为</p>
                </div>
              </div>

              <div className="settings-group-label">词 库 与 过 滤</div>
              <section className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">词库管理</div>
                    <div className="settings-row-desc">
                      启用或导入考研、四六级、雅思、托福、GRE 等词表
                    </div>
                  </div>
                  <button
                    type="button"
                    className="settings-action-btn"
                    onClick={onOpenPlugins}
                  >
                    打开词库管理…
                  </button>
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">基础词过滤（A1–A2）</div>
                    <div className="settings-row-desc">
                      忽略 the / a / of / be 等高频简单词标注，生词本中已收藏的词仍保留
                    </div>
                  </div>
                  <Switch
                    checked={filterBasic}
                    label="基础词过滤"
                    onChange={(v) => onUpdate({ filterBasic: v })}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">行内点击取词</div>
                    <div className="settings-row-desc">
                      在正文中单击英文单词即可在右侧面板查词
                    </div>
                  </div>
                  <Switch
                    checked={clickLookup}
                    label="行内点击取词"
                    onChange={(v) => onUpdate({ clickLookup: v })}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">选中单词自动发音</div>
                    <div className="settings-row-desc">
                      查词时自动播放美式 / 英式读音
                    </div>
                  </div>
                  <Switch
                    checked={autoSpeak}
                    label="选中单词自动发音"
                    onChange={(v) => onUpdate({ autoSpeak: v })}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">自动加入生词本</div>
                    <div className="settings-row-desc">
                      首次查询的生词自动收藏到当前书本生词本
                    </div>
                  </div>
                  <Switch
                    checked={autoSaveWord}
                    label="自动加入生词本"
                    onChange={(v) => onUpdate({ autoSaveWord: v })}
                  />
                </div>
              </section>

              <div className="settings-group-label">扩 展 插 件 · ANKICONNECT</div>
              <section className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">启用 AnkiConnect 扩展</div>
                    <div className="settings-row-desc">
                      独立扩展功能，可将今日加入生词本的词直接推送到桌面版 Anki（不影响主功能）
                    </div>
                  </div>
                  <Switch
                    checked={ankiEnabled}
                    label="启用 AnkiConnect 扩展"
                    onChange={(v) => onUpdate({ ankiConnectEnabled: v })}
                  />
                </div>

                {ankiEnabled ? (
                  <>
                    <div className="settings-row">
                      <div className="settings-row-info">
                        <div className="settings-row-title">AnkiConnect 连接</div>
                        <div className="settings-row-desc">
                          {ankiStatus || `默认地址：${ankiUrl}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="settings-action-btn"
                        disabled={ankiBusy}
                        onClick={() => void testAnki()}
                      >
                        {ankiBusy ? "检测中…" : "检测连接并拉取牌组"}
                      </button>
                    </div>

                    <div className="settings-row">
                      <div className="settings-row-info">
                        <div className="settings-row-title">目标牌组（支持多级子牌组路径）</div>
                        <div className="settings-row-desc">
                          推送目标，例如：考研英语词汇::单词::生词组
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="text"
                          className="settings-select"
                          style={{ minWidth: "260px" }}
                          aria-label="自定义目标牌组路径"
                          value={ankiDeck}
                          placeholder="例如：考研英语词汇::单词::生词组"
                          onChange={(e) => onUpdate({ ankiDeck: e.target.value })}
                        />
                        {ankiDecks.length ? (
                          <select
                            className="settings-select"
                            style={{ minWidth: "120px" }}
                            aria-label="从现有牌组中选择"
                            value={ankiDecks.includes(ankiDeck) ? ankiDeck : ""}
                            onChange={(e) => {
                              if (e.target.value) onUpdate({ ankiDeck: e.target.value });
                            }}
                          >
                            <option value="">快速填入已有牌组…</option>
                            {ankiDecks.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </div>

                    <div className="settings-row">
                      <div className="settings-row-info">
                        <div className="settings-row-title">引用已有牌组</div>
                        <div className="settings-row-desc">
                          开启后，今日生词会优先从下面的源牌组中把「现成的卡片」
                          移入目标子牌组，不会重复新建卡片；源牌组没收录的词才新建。
                        </div>
                      </div>
                      <Switch
                        checked={ankiReuseExisting}
                        label="引用已有牌组"
                        onChange={(v) => onUpdate({ ankiReuseExisting: v })}
                      />
                    </div>

                    {ankiReuseExisting ? (
                      <div className="settings-row">
                        <div className="settings-row-info">
                          <div className="settings-row-title">源牌组（从哪里移入卡片）</div>
                          <div className="settings-row-desc">
                            留空表示在整份 Anki 收藏中查找；建议填你导入的大牌组，例如：考研英语词汇
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <input
                            type="text"
                            className="settings-select"
                            style={{ minWidth: "260px" }}
                            aria-label="源牌组路径"
                            value={settings.ankiSourceDeck ?? ""}
                            placeholder="例如：考研英语词汇"
                            onChange={(e) => onUpdate({ ankiSourceDeck: e.target.value })}
                          />
                          {ankiDecks.length ? (
                            <select
                              className="settings-select"
                              style={{ minWidth: "120px" }}
                              aria-label="从现有牌组中选择源牌组"
                              value={
                                ankiDecks.includes(settings.ankiSourceDeck ?? "")
                                  ? settings.ankiSourceDeck
                                  : ""
                              }
                              onChange={(e) => {
                                if (e.target.value) onUpdate({ ankiSourceDeck: e.target.value });
                              }}
                            >
                              <option value="">快速填入已有牌组…</option>
                              {ankiDecks.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="settings-row">
                      <div className="settings-row-info">
                        <div className="settings-row-title">推送今日生词</div>
                        <div className="settings-row-desc">
                          今日已加入生词本 {todayCount} 个词
                          {ankiReuseExisting ? "（优先复用已有卡片）" : "（自动跳过 Anki 中已存在的词）"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="settings-action-btn"
                        disabled={ankiBusy || todayCount === 0}
                        onClick={() => void syncTodayToAnki()}
                      >
                        推送 {todayCount} 个词到 Anki
                      </button>
                    </div>
                  </>
                ) : null}
              </section>
            </>
          ) : null}

          {section === "library" ? (
            <>
              <div className="settings-page-head">
                <div>
                  <h1>书库与同步</h1>
                  <p>本地 EPUB 导入与阅读进度保存</p>
                </div>
              </div>

              <div className="settings-group-label">书 库 目 录</div>
              <section className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">磁盘书库（按内容哈希去重）</div>
                    <div className="settings-row-desc">
                      {libraryDir
                        ? `每本书存为 books/<SHA-256>.epub，同内容的书只有一份；清单是 library.json。当前共 ${libraryCount ?? 0} 本。`
                        : "浏览器预览没有本地书库；桌面端会把导入的 EPUB 存到应用数据目录。"}
                    </div>
                  </div>
                  {libraryDir ? (
                    <button
                      type="button"
                      className="settings-action-btn"
                      onClick={() => {
                        void navigator.clipboard?.writeText(libraryDir);
                        onToast("已复制书库路径");
                      }}
                    >
                      复制路径
                    </button>
                  ) : null}
                </div>
                {libraryDir ? (
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <div className="settings-row-desc" style={{ wordBreak: "break-all" }}>
                        {libraryDir}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="settings-group-label">本 地 存 储</div>
              <section className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">阅读进度自动同步</div>
                    <div className="settings-row-desc">
                      自动记录每本书最后阅读的章节与位置
                    </div>
                  </div>
                  <Switch
                    checked={autoSync}
                    label="阅读进度自动同步"
                    onChange={(v) => onUpdate({ autoSync: v })}
                  />
                </div>
              </section>
            </>
          ) : null}

          {section === "appearance" ? (
            <>
              <div className="settings-page-head">
                <div>
                  <h1>外观与护眼</h1>
                  <p>当前主题：{themeLabel(activeTheme)}（深色与浅色主题各自记忆）</p>
                </div>
              </div>

              <div className="settings-group-label">护 眼 与 明 暗</div>
              <section className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">浅色模式</div>
                    <div className="settings-row-desc">
                      在深色主题与浅色主题之间快速切换
                    </div>
                  </div>
                  <Switch
                    checked={light}
                    label="浅色模式"
                    onChange={onToggleLight}
                  />
                </div>

                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">护眼暖色模式</div>
                    <div className="settings-row-desc">
                      降低蓝光对比度，适合夜间长时间精读（开启时切回默认深色）
                    </div>
                  </div>
                  <Switch
                    checked={warm}
                    label="护眼暖色模式"
                    onChange={onToggleWarm}
                  />
                </div>
              </section>

              <div className="settings-group-label">深 色 主 题 · 6 套</div>
              <div className="theme-grid settings-theme-grid">
                {darkThemes.map((t) => {
                  const selected = t.key === activeTheme;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`theme-card${selected ? " selected" : ""}`}
                      onClick={() => onPickTheme(t.key)}
                    >
                      <span
                        className="theme-swatch"
                        style={{
                          background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]} 55%, ${t.swatch[2]})`,
                        }}
                      />
                      <span className="theme-card-meta">
                        <span className="theme-card-name">{t.label}</span>
                        <span className="theme-card-mode">深色</span>
                      </span>
                      {selected ? (
                        <span className="theme-card-check" aria-label="当前使用">
                          <Check size={14} strokeWidth={2.2} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="settings-group-label">浅 色 主 题 · 6 套</div>
              <div className="theme-grid settings-theme-grid">
                {lightThemes.map((t) => {
                  const selected = t.key === activeTheme;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`theme-card${selected ? " selected" : ""}`}
                      onClick={() => onPickTheme(t.key)}
                    >
                      <span
                        className="theme-swatch"
                        style={{
                          background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]} 55%, ${t.swatch[2]})`,
                        }}
                      />
                      <span className="theme-card-meta">
                        <span className="theme-card-name">{t.label}</span>
                        <span className="theme-card-mode">浅色</span>
                      </span>
                      {selected ? (
                        <span className="theme-card-check" aria-label="当前使用">
                          <Check size={14} strokeWidth={2.2} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {section === "shortcuts" ? (
            <>
              <div className="settings-page-head">
                <div>
                  <h1>快捷键</h1>
                  <p>翻页、缩放与全文搜索</p>
                </div>
              </div>
              <div className="settings-group-label">常 用 快 捷 键</div>
              <section className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">全文搜索</div>
                    <div className="settings-row-desc">在当前文章内检索关键词</div>
                  </div>
                  <kbd className="settings-kbd">Ctrl + F</kbd>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">放大 / 缩小</div>
                    <div className="settings-row-desc">调整阅读器页面缩放比例</div>
                  </div>
                  <kbd className="settings-kbd">Ctrl + + / -</kbd>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">重置缩放</div>
                    <div className="settings-row-desc">恢复 100% 缩放</div>
                  </div>
                  <kbd className="settings-kbd">Ctrl + 0</kbd>
                </div>
              </section>
            </>
          ) : null}

          {section === "about" ? (
            <>
              <div className="settings-page-head">
                <div>
                  <h1>关于</h1>
                  <p>Quiet Reader v0.2.4</p>
                </div>
              </div>
              <div className="settings-group-label">应 用 信 息</div>
              <section className="settings-card">
                <div className="settings-row">
                  <div className="settings-row-info">
                    <div className="settings-row-title">Quiet Reader</div>
                    <div className="settings-row-desc">
                      Tauri + React 外刊精读与生词本工具
                    </div>
                  </div>
                  <span className="settings-version-pill">v0.2.4</span>
                </div>
              </section>
            </>
          ) : null}
        </main>
      </div>

      <footer className="settings-footer">
        <span className="settings-saved-dot">
          <i aria-hidden="true" />
          设置已自动保存
        </span>
        <span>Quiet Reader v0.2.4</span>
      </footer>
    </div>
  );
}
