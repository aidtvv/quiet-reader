import { useEffect, useState } from "react";
import { BookOpen, Check, Eye, Pin, Plus, Volume2, X } from "lucide-react";
import { fetchWordDetail, type OnlineWordDetail } from "../lib/onlineDict";
import type { DictEntry } from "../types";

type WordPanelProps = {
  entry: DictEntry | null;
  selected: { lemma: string; surface: string; sentence?: string } | null;
  listNames: string[];
  phonetic?: string;
  sentence?: string;
  saved: boolean;
  known: boolean;
  basic?: boolean;
  hits?: number;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onSpeak: () => void;
  onToggleSaved: () => void;
  onToggleKnown: () => void;
  onToast: (msg: string) => void;
};

export function WordPanel({
  entry,
  selected,
  listNames,
  phonetic,
  sentence,
  saved,
  known,
  basic,
  pinned,
  onTogglePin,
  onClose,
  onSpeak,
  onToggleSaved,
  onToggleKnown,
}: WordPanelProps) {
  const surface = selected?.surface ?? null;
  const word = entry?.lemma ?? surface ?? selected?.lemma ?? "";
  const trans = entry?.entry.trans ?? [];
  const [online, setOnline] = useState<OnlineWordDetail | null>(null);
  const [loadingOnline, setLoadingOnline] = useState(false);

  useEffect(() => {
    if (!word) {
      setOnline(null);
      setLoadingOnline(false);
      return;
    }
    const controller = new AbortController();
    setLoadingOnline(true);
    fetchWordDetail(word, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setOnline(detail);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingOnline(false);
      });
    return () => controller.abort();
  }, [word]);

  return (
    <aside className="word-panel">
      <div className="panel-head word-head">
        <BookOpen size={20} strokeWidth={1.55} className="panel-head-icon" />
        <span className="panel-title">单词释义</span>
        <button
          className={`pin-button ${pinned ? "pinned" : ""}`}
          type="button"
          title={pinned ? "取消固定侧栏" : "固定侧栏"}
          onClick={onTogglePin}
        >
          <Pin size={16} strokeWidth={1.7} />
          {pinned ? "已固定" : "固定"}
        </button>
        <button className="icon-button small close-button" type="button" title="关闭" onClick={onClose}>
          <X size={17} strokeWidth={1.7} />
        </button>
      </div>
      <div className="panel-rule full" />

      {!word ? (
        <div className="word-empty">
          <BookOpen size={22} strokeWidth={1.4} />
          <p>点正文里带下划线的词</p>
          <span>这里会显示释义、音标、所属词表和文中语境。</span>
        </div>
      ) : (
        <>
          <div className="word-scroll">
            <div className="word-eyebrow">文中选词  /  WORD LOOKUP</div>
            <h2 className="word-title">{word}</h2>
            <div className="phonetic-row">
              <span className="phonetic">{phonetic || "—"}</span>
              <button className="sound-button" type="button" title="播放发音" onClick={onSpeak}>
                <Volume2 size={18} strokeWidth={1.6} />
              </button>
            </div>

            <div className="tag-row">
              {listNames.length ? (
                listNames.map((name) => (
                  <span className="dict-tag" key={name}>
                    {name}
                  </span>
                ))
              ) : (
                <span className="pos-note">当前词表未收录</span>
              )}
              {basic ? <span className="state-tag basic-tag">基础词</span> : null}
              {saved ? <span className="state-tag saved-tag">生词本</span> : null}
              {known ? <span className="state-tag known-tag">已认识</span> : null}
            </div>
            <div className="panel-rule word-rule" />

            <div className="section-label">核心释义</div>
            {trans.length ? (
              <ul className="word-senses">
                {trans.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="word-cn">词表里没有这个词的释义。可以换一份词表，或把它导入自定义词表。</p>
            )}

            {sentence ? (
              <>
                <div className="panel-rule word-rule" />
                <div className="section-label">文中语境</div>
                <div className="quote-card">
                  <span className="quote-bar" />
                  <p className="quote-en">{sentence}</p>
                </div>
              </>
            ) : null}

            {loadingOnline ? (
              <p className="word-cn" style={{ marginTop: 12, opacity: 0.7 }}>
                正在获取权威词典释义与词源…
              </p>
            ) : online ? (
              <>
                {online.origin ? (
                  <>
                    <div className="panel-rule word-rule" />
                    <div className="section-label">词源 / 词根</div>
                    <p className="word-cn">{online.origin}</p>
                  </>
                ) : null}
                {online.derivatives?.length ? (
                  <>
                    <div className="panel-rule word-rule" />
                    <div className="section-label">派生 / 同根词</div>
                    <ul className="word-senses">
                      {online.derivatives.map((d) => (
                        <li key={`${d.word}-${d.pos}`}>
                          <strong>{d.word}</strong>{" "}
                          {d.pos ? <span>({d.pos}) </span> : null}
                          {d.tran}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {online.meanings.length ? (
                  <>
                    <div className="panel-rule word-rule" />
                    <div className="section-label">
                      {online.source || "权威英英释义"}
                    </div>
                    <ul className="word-senses">
                      {online.meanings.map((m, idx) => (
                        <li key={`${m.partOfSpeech}-${idx}`}>
                          <strong>{m.partOfSpeech}</strong>{" "}
                          {m.definitions[0]?.definition}
                          {m.synonyms.length ? (
                            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                              近义/派生：{m.synonyms.join(", ")}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="word-footer">
            <div className="word-footer-rule" />
            <div className="word-actions">
              <button
                className={`save-button ${saved ? "saved" : ""}`}
                type="button"
                title={saved ? "从生词本移除" : "不认识，加入生词本"}
                onClick={onToggleSaved}
              >
                {saved ? <Check size={18} strokeWidth={1.9} /> : <Plus size={18} strokeWidth={1.9} />}
                {saved ? "已在生词本" : "加入生词本"}
              </button>
              <button
                className={`known-button ${known ? "active" : ""}`}
                type="button"
                title={known ? "撤销「已认识」标记" : "标记为已认识，正文里不再高亮"}
                onClick={onToggleKnown}
              >
                <Eye size={17} strokeWidth={1.7} />
                {known ? "已认识" : "认识"}
              </button>
            </div>
            <p className="word-footnote">
              {pinned ? "已固定侧栏 · 选词时保持展开" : "未固定侧栏 · 选词时自动展开"}
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
