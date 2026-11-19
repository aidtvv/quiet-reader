import { useRef, useState } from "react";
import { ChevronLeft, FileUp, Library, Search, X } from "lucide-react";
import type { PluginMeta, WordListEntry } from "../types";
import { parseCustomEntryList } from "../lib/dict";
import type { CustomPlugin } from "../lib/store";

type PluginManagerProps = {
  metas: PluginMeta[];
  custom: CustomPlugin[];
  enabled: Set<string>;
  entries: Record<string, WordListEntry[] | undefined>;
  onToggle: (id: string) => void;
  onLoadEntries: (id: string) => void;
  onAddCustom: (name: string, entries: WordListEntry[], fileName: string) => void;
  onClose: () => void;
};

type PendingImport = {
  name: string;
  fileName: string;
  entries: WordListEntry[];
};

export function PluginManager({
  metas,
  custom,
  enabled,
  entries,
  onToggle,
  onLoadEntries,
  onAddCustom,
  onClose,
}: PluginManagerProps) {
  const [viewing, setViewing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingImport | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = [...metas, ...custom];
  const active = all.find((plugin) => plugin.id === viewing);
  const activeEntries = viewing ? entries[viewing] : undefined;
  const normalized = query.trim().toLowerCase();
  const filtered = (activeEntries ?? []).filter(
    (entry) =>
      !normalized ||
      entry.name.toLowerCase().includes(normalized) ||
      entry.trans.some((line) => line.toLowerCase().includes(normalized)),
  );

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCustomEntryList(file.name, text);
    setPending({ ...parsed, fileName: file.name });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <Library size={19} strokeWidth={1.6} />
          <span className="modal-title">
            {active ? active.name : "词库管理"}
          </span>
          <span className="modal-sub">
            已启用 {enabled.size} / {all.length}
          </span>
          <button className="icon-button small" type="button" title="关闭" onClick={onClose}>
            <X size={17} strokeWidth={1.7} />
          </button>
        </div>

        {active ? (
          <div className="modal-body">
            <div className="view-head">
              <button className="mini-button" type="button" onClick={() => setViewing(null)}>
                <ChevronLeft size={14} strokeWidth={1.8} />
                返回
              </button>
              <label className="outline-search modal-search">
                <Search size={15} strokeWidth={1.7} />
                <input
                  value={query}
                  placeholder="搜索词条"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <span className="view-count">
                {activeEntries
                  ? `${filtered.length} / ${activeEntries.length}`
                  : "加载中…"}
              </span>
            </div>
            <div className="view-list">
              {filtered.slice(0, 400).map((entry) => (
                <div className="view-row" key={entry.name}>
                  <strong>{entry.name}</strong>
                  <span>{entry.trans.join("；")}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="modal-body">
            {pending ? (
              <div className="import-preview">
                <div className="section-label">导入预览</div>
                <p className="preview-line">
                  {pending.fileName} · 识别到 {pending.entries.length} 个词条
                </p>
                <div className="preview-list">
                  {pending.entries.slice(0, 3).map((entry) => (
                    <div className="view-row" key={entry.name}>
                      <strong>{entry.name}</strong>
                      <span>{entry.trans.join("；") || "（无释义）"}</span>
                    </div>
                  ))}
                </div>
                <div className="preview-actions">
                  <button
                    className="primary-button small-primary"
                    type="button"
                    disabled={!pending.entries.length}
                    onClick={() => {
                      onAddCustom(pending.name, pending.entries, pending.fileName);
                      setPending(null);
                    }}
                  >
                    导入并启用
                  </button>
                  <button className="ghost-button" type="button" onClick={() => setPending(null)}>
                    取消
                  </button>
                </div>
              </div>
            ) : null}

            <div className="plugin-list">
              {all.map((plugin) => {
                const isOn = enabled.has(plugin.id);
                const loaded = Boolean(entries[plugin.id]);
                return (
                  <div className="plugin-row" key={plugin.id}>
                    <label className="plugin-toggle">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => {
                          onToggle(plugin.id);
                          if (!isOn && !loaded) onLoadEntries(plugin.id);
                        }}
                      />
                      <span className="plugin-name">{plugin.name}</span>
                    </label>
                    <div className="plugin-meta">
                      <span title={`原始 ${plugin.wordCount} 条，去掉短语后可匹配 ${plugin.matchableCount} 条`}>
                        {plugin.matchableCount} 可匹配 / {plugin.wordCount} 条
                      </span>
                      <span className="plugin-source" title={`${plugin.source} · ${plugin.license}`}>
                        {plugin.source.replace(/^https?:\/\//, "")}
                      </span>
                    </div>
                    <div className="plugin-actions">
                      <button
                        className="mini-button"
                        type="button"
                        onClick={() => {
                          setViewing(plugin.id);
                          setQuery("");
                          if (!loaded) onLoadEntries(plugin.id);
                        }}
                      >
                        查看词表
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="import-row">
              <button className="ghost-button" type="button" onClick={() => inputRef.current?.click()}>
                <FileUp size={16} strokeWidth={1.6} />
                导入词表
              </button>
              <span className="import-hint">
                支持 qwerty-learner 的 JSON 数组，或 CSV（word,translation,phonetic）。
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".json,.csv"
                hidden
                onChange={(event) => {
                  void readFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
        )}

        <div className="modal-foot">
          内置词表来自 qwerty-learner（GPL-3.0），词表版权归原出版方；词形数据来自
          ECDICT。
        </div>
      </div>
    </div>
  );
}
