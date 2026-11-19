import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Moon,
  Search,
  SunMedium,
  Trash2,
  Volume2,
} from "lucide-react";
import {
  DEFAULT_ANKI_CONNECT_URL,
  DEFAULT_ANKI_TARGET_DECK,
  createAnkiDeck,
  getAnkiDecks,
  pushTodayWordsToAnki,
  todayWordbookEntries,
} from "../lib/ankiConnect";
import type { Settings, WordEntry } from "../types";
import { Topbar } from "./Topbar";

type ViewMode = "date" | "status";
type StatusFilter = "all" | "pending" | "learning" | "mastered";

type VocabularyPageProps = {
  wordbook: Record<string, WordEntry>;
  known: Set<string>;
  settings: Settings;
  light: boolean;
  onToggleKnown: (lemma: string) => void;
  onRemoveWord: (lemma: string) => void;
  onToggleLight: () => void;
  onBackToShelf: () => void;
  onOpenSettings: () => void;
  onNavigateToArticle?: (bookId: string, articleId: string) => void;
  onUpdateDeck?: (deck: string) => void;
  onToast: (msg: string) => void;
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  const m = d.getMonth() + 1;
  const day = d.getDate();
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;

  if (isToday) return `今天 · ${m}月${day}日|${time}`;
  if (isYesterday) return `昨天 · ${m}月${day}日|${time}`;
  return `${m}月${day}日|${time}`;
}

export function VocabularyPage({
  wordbook,
  known,
  settings,
  light,
  onToggleKnown,
  onRemoveWord,
  onToggleLight,
  onBackToShelf,
  onOpenSettings,
  onNavigateToArticle,
  onUpdateDeck,
  onToast,
}: VocabularyPageProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("date");
  const [statusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedLemma, setSelectedLemma] = useState<string | null>(null);

  // Anki 决策弹窗状态
  const [ankiModalOpen, setAnkiModalOpen] = useState(false);
  const [targetDeck, setTargetDeck] = useState(
    settings.ankiDeck || DEFAULT_ANKI_TARGET_DECK,
  );
  const [existingDecks, setExistingDecks] = useState<string[]>([]);
  const [pushing, setPushing] = useState(false);

  const words = useMemo(() => {
    let list = Object.values(wordbook).sort((a, b) => b.addedAt - a.addedAt);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (w) =>
          w.lemma.toLowerCase().includes(q) ||
          w.surface.toLowerCase().includes(q) ||
          w.trans.some((t) => t.includes(q)) ||
          w.bookTitle?.toLowerCase().includes(q),
      );
    }
    if (viewMode === "status" && statusFilter !== "all") {
      if (statusFilter === "mastered") {
        list = list.filter((w) => known.has(w.lemma));
      } else if (statusFilter === "pending") {
        list = list.filter((w) => !known.has(w.lemma));
      }
    }
    return list;
  }, [wordbook, search, viewMode, statusFilter, known]);

  const activeWord =
    (selectedLemma && wordbook[selectedLemma]) || words[0] || null;

  const todayWords = useMemo(
    () => todayWordbookEntries(wordbook),
    [wordbook],
  );

  // 日期分组
  const dateGroups = useMemo(() => {
    const groups: { label: string; items: WordEntry[] }[] = [];
    const map = new Map<string, WordEntry[]>();
    for (const w of words) {
      const [dateLabel] = formatDate(w.addedAt).split("|");
      if (!map.has(dateLabel)) {
        map.set(dateLabel, []);
        groups.push({ label: dateLabel, items: map.get(dateLabel)! });
      }
      map.get(dateLabel)!.push(w);
    }
    return groups;
  }, [words]);

  // 状态分组：待复习 / 已掌握
  const statusGroups = useMemo(() => {
    const pending = words.filter((w) => !known.has(w.lemma));
    const mastered = words.filter((w) => known.has(w.lemma));
    return [
      { key: "pending", label: "待复习", note: "尚未标记掌握", items: pending },
      { key: "mastered", label: "已掌握", note: "已确认认识", items: mastered },
    ].filter((group) => group.items.length > 0);
  }, [words, known]);

  // 引用已有牌组相关配置（设置页可开关）
  const pushOptions = useMemo(
    () => ({
      reuseExisting: settings.ankiReuseExisting ?? false,
      sourceDeck: settings.ankiSourceDeck ?? "",
    }),
    [settings.ankiReuseExisting, settings.ankiSourceDeck],
  );

  const describePush = (res: {
    moved: number;
    added: number;
    skipped: number;
    already: number;
  }) => {
    const parts: string[] = [];
    if (res.moved) parts.push(`移入 ${res.moved} 张已有卡片`);
    if (res.added) parts.push(`新建 ${res.added} 张`);
    if (res.already) parts.push(`已在目标牌组 ${res.already} 个`);
    if (res.skipped) parts.push(`跳过重复 ${res.skipped} 张`);
    return parts.length ? parts.join(" · ") : "没有需要处理的变化";
  };

  // 点击「今日复习 / 推送 Anki」触发检测决策流程
  const handleStartReview = async () => {
    if (!todayWords.length) {
      onToast("今天还没有加入生词本的新词");
      return;
    }
    if (settings.ankiConnectEnabled === false) {
      onToast("AnkiConnect 扩展未启用，请先在设置中开启");
      onOpenSettings();
      return;
    }
    const ankiUrl = settings.ankiConnectUrl || DEFAULT_ANKI_CONNECT_URL;
    setPushing(true);
    try {
      const decks = await getAnkiDecks(ankiUrl);
      setExistingDecks(decks);
      const wanted = targetDeck.trim();
      if (decks.includes(wanted)) {
        // 存在则直接推
        const res = await pushTodayWordsToAnki(
          wordbook,
          wanted,
          ankiUrl,
          pushOptions,
        );
        onToast(`已同步到「${wanted}」：${describePush(res)}`);
      } else {
        // 不存在：弹出决策弹窗，让用户选择自动创建或改选已有牌组
        setAnkiModalOpen(true);
      }
    } catch (err) {
      onToast(
        err instanceof Error && err.message
          ? err.message
          : "无法连接 AnkiConnect，请确认 Anki 已开启",
      );
    } finally {
      setPushing(false);
    }
  };

  const handleConfirmCreateAndPush = async () => {
    const ankiUrl = settings.ankiConnectUrl || DEFAULT_ANKI_CONNECT_URL;
    setPushing(true);
    try {
      await createAnkiDeck(targetDeck, ankiUrl);
      const res = await pushTodayWordsToAnki(
        wordbook,
        targetDeck,
        ankiUrl,
        pushOptions,
      );
      setAnkiModalOpen(false);
      onUpdateDeck?.(targetDeck);
      onToast(`已创建「${targetDeck}」并同步：${describePush(res)}`);
    } catch (err) {
      onToast(
        err instanceof Error && err.message
          ? err.message
          : "创建或推送失败，请检查 AnkiConnect",
      );
    } finally {
      setPushing(false);
    }
  };

  const handlePushToExisting = async (deck: string) => {
    const ankiUrl = settings.ankiConnectUrl || DEFAULT_ANKI_CONNECT_URL;
    setPushing(true);
    try {
      setTargetDeck(deck);
      const res = await pushTodayWordsToAnki(
        wordbook,
        deck,
        ankiUrl,
        pushOptions,
      );
      setAnkiModalOpen(false);
      onUpdateDeck?.(deck);
      onToast(`已同步到「${deck}」：${describePush(res)}`);
    } catch (err) {
      onToast(
        err instanceof Error && err.message
          ? err.message
          : "推送失败，请检查 AnkiConnect",
      );
    } finally {
      setPushing(false);
    }
  };

  const speak = (w: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(w);
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div className="vocab-view">
      <Topbar
        nav={[
          { key: "shelf", label: "书架", onClick: onBackToShelf },
          { key: "vocab", label: "生词本", active: true, onClick: () => {} },
          { key: "settings", label: "设置", onClick: onOpenSettings },
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

      <div className="vocab-body">
        <div className="vocab-list-pane">
          <div className="vocab-head">
            <div className="vocab-title-wrap">
              <h1>生词本</h1>
              <p>
                共 {Object.keys(wordbook).length} 个生词 · 今日新增 {todayWords.length} 个
              </p>
            </div>
            <div className="vocab-actions">
              <div className="vocab-mode-seg">
                <button
                  type="button"
                  className={`vocab-mode-btn${viewMode === "date" ? " active" : ""}`}
                  onClick={() => setViewMode("date")}
                >
                  按日归档
                </button>
                <button
                  type="button"
                  className={`vocab-mode-btn${viewMode === "status" ? " active" : ""}`}
                  onClick={() => setViewMode("status")}
                >
                  状态分类
                </button>
              </div>

              <button
                type="button"
                className="vocab-review-btn"
                disabled={pushing || todayWords.length === 0}
                onClick={() => void handleStartReview()}
              >
                今日复习 ({todayWords.length})
              </button>
            </div>
          </div>

          <div className="vocab-search-row">
            <div className="vocab-search-box">
              <Search size={15} strokeWidth={1.7} />
              <input
                type="text"
                value={search}
                placeholder="搜索生词、释义或来源书目…"
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="vocab-cards-scroll">
            {viewMode === "date" ? (
              dateGroups.map((group) => (
                <div key={group.label} className="vocab-group">
                  <div className="vocab-group-title">
                    <span className="vocab-dot" />
                    <span>{group.label}</span>
                    <span className="vocab-group-count">{group.items.length} 个词</span>
                  </div>
                  <div className="vocab-cards-grid">
                    {group.items.map((w) => {
                      const isSelected = activeWord?.lemma === w.lemma;
                      const isMastered = known.has(w.lemma);
                      const [, timeStr] = formatDate(w.addedAt).split("|");
                      return (
                        <div
                          key={w.lemma}
                          className={`vocab-card${isSelected ? " selected" : ""}`}
                          onClick={() => setSelectedLemma(w.lemma)}
                        >
                          <div className="vocab-card-top">
                            <div>
                              <span className="vocab-card-word">{w.lemma}</span>
                              {w.phonetic ? (
                                <span className="vocab-card-pho">{w.phonetic}</span>
                              ) : null}
                            </div>
                            <span className="vocab-card-time">{timeStr}</span>
                          </div>
                          <div className="vocab-card-trans">
                            {w.trans.slice(0, 2).join("；") || "暂无中文释义"}
                          </div>
                          <div className="vocab-card-footer">
                            <span className="vocab-card-source" title={w.bookTitle}>
                              {w.bookTitle || "外刊精读"}
                            </span>
                            <span className={`vocab-badge ${isMastered ? "mastered" : "pending"}`}>
                              {isMastered ? "已掌握" : "待复习"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              statusGroups.map((group) => (
                <div key={group.key} className="vocab-group">
                  <div className="vocab-group-title">
                    <span className={`vocab-dot ${group.key}`} />
                    <span>{group.label}</span>
                    <span className="vocab-group-note">{group.note}</span>
                    <span className="vocab-group-count">{group.items.length} 个词</span>
                  </div>
                  <div className="vocab-cards-grid">
                    {group.items.map((w) => {
                      const isSelected = activeWord?.lemma === w.lemma;
                      const isMastered = known.has(w.lemma);
                      return (
                        <div
                          key={w.lemma}
                          className={`vocab-card${isSelected ? " selected" : ""}`}
                          onClick={() => setSelectedLemma(w.lemma)}
                        >
                          <div className="vocab-card-top">
                            <div>
                              <span className="vocab-card-word">{w.lemma}</span>
                              {w.phonetic ? (
                                <span className="vocab-card-pho">{w.phonetic}</span>
                              ) : null}
                            </div>
                            <span className={`vocab-badge ${isMastered ? "mastered" : "pending"}`}>
                              {isMastered ? "已掌握" : "待复习"}
                            </span>
                          </div>
                          <div className="vocab-card-trans">
                            {w.trans.slice(0, 2).join("；") || "暂无中文释义"}
                          </div>
                          <div className="vocab-card-footer">
                            <span className="vocab-card-source">{w.bookTitle || "外刊精读"}</span>
                            <span className="vocab-card-time">
                              {formatDate(w.addedAt).split("|")[1]}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}

            {!words.length ? (
              <div className="vocab-empty">
                <p>生词本暂无匹配单词</p>
                <span>在正文中点击生词或点击「加入生词本」，即可沉淀到这里。</span>
              </div>
            ) : null}
          </div>
        </div>

        {activeWord ? (
          <aside className="vocab-detail-pane">
            <div className="vocab-detail-head">
              <div>
                <h2>{activeWord.lemma}</h2>
                <div className="vocab-detail-pho-row">
                  <span className="vocab-detail-pho">{activeWord.phonetic || "—"}</span>
                  <button
                    type="button"
                    className="vocab-sound-btn"
                    title="播放发音"
                    onClick={() => speak(activeWord.surface || activeWord.lemma)}
                  >
                    <Volume2 size={16} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
              <span className={`vocab-badge ${known.has(activeWord.lemma) ? "mastered" : "pending"}`}>
                {known.has(activeWord.lemma) ? "已掌握" : "待复习"}
              </span>
            </div>

            <div className="vocab-detail-rule" />

            <div className="vocab-section-title">核心释义</div>
            <ul className="vocab-trans-list">
              {activeWord.trans.map((t, idx) => (
                <li key={idx}>{t}</li>
              ))}
            </ul>

            {activeWord.sentence ? (
              <>
                <div className="vocab-detail-rule" />
                <div className="vocab-section-title">文中语境</div>
                <div className="vocab-quote-card">
                  <span className="vocab-quote-bar" />
                  <p className="vocab-quote-en">{activeWord.sentence}</p>
                  <div className="vocab-quote-meta">
                    {activeWord.bookTitle || "外刊"} · {activeWord.section || "正文"}
                  </div>
                </div>
              </>
            ) : null}

            <div className="vocab-detail-footer">
              <button
                type="button"
                className={`vocab-action-btn ${known.has(activeWord.lemma) ? "active" : ""}`}
                onClick={() => onToggleKnown(activeWord.lemma)}
              >
                <CheckCircle2 size={16} strokeWidth={1.8} />
                {known.has(activeWord.lemma) ? "撤销已掌握" : "标为已掌握"}
              </button>
              {activeWord.bookId && activeWord.articleId && onNavigateToArticle ? (
                <button
                  type="button"
                  className="vocab-jump-btn"
                  onClick={() =>
                    onNavigateToArticle(activeWord.bookId!, activeWord.articleId!)
                  }
                >
                  在原文中查看
                  <ExternalLink size={14} strokeWidth={1.8} />
                </button>
              ) : null}
              <button
                type="button"
                className="vocab-icon-btn"
                title="从生词本删除"
                onClick={() => onRemoveWord(activeWord.lemma)}
              >
                <Trash2 size={16} strokeWidth={1.8} />
              </button>
            </div>
          </aside>
        ) : null}
      </div>

      {/* 牌组不存在时的决策弹窗 */}
      {ankiModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal anki-decision-modal">
            <div className="modal-head">
              <h3>未检测到目标子牌组</h3>
            </div>
            <div className="modal-body">
              <p style={{ margin: "0 0 12px", fontSize: "13px", lineHeight: "1.6" }}>
                你的 Anki 中当前不存在子牌组：
                <br />
                <strong style={{ color: "var(--th-accent, #b8cead)" }}>
                  {targetDeck}
                </strong>
              </p>
              <p style={{ margin: "0 0 16px", fontSize: "12px", color: "var(--th-muted, #8e8e86)" }}>
                {pushOptions.reuseExisting
                  ? `会从「${pushOptions.sourceDeck || "整个 Anki 收藏"}」中把今日生词的现成卡片移入该子牌组，源牌组没收录的词才新建。`
                  : "会把今日生词作为新卡片写入该子牌组。"}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  type="button"
                  className="settings-action-btn"
                  style={{ justifyContent: "center", padding: "10px" }}
                  disabled={pushing}
                  onClick={() => void handleConfirmCreateAndPush()}
                >
                  自动在 Anki 中创建「{targetDeck}」并同步今日生词
                </button>

                {existingDecks.length ? (
                  <div style={{ marginTop: "8px" }}>
                    <div style={{ fontSize: "12px", marginBottom: "6px", color: "var(--th-muted)" }}>
                      或者推送到现有的牌组：
                    </div>
                    <select
                      className="settings-select"
                      style={{ width: "100%" }}
                      onChange={(e) => {
                        if (e.target.value) void handlePushToExisting(e.target.value);
                      }}
                    >
                      <option value="">选择已有牌组推送…</option>
                      {existingDecks.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="modal-btn"
                onClick={() => setAnkiModalOpen(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
