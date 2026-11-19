import { useRef, useState } from "react";
import { BookOpen, FolderOpen, Library, Upload } from "lucide-react";
import type { StoredBook } from "../lib/store";

type WelcomeProps = {
  recent: StoredBook[];
  busy: boolean;
  onOpenFile: (file: File) => void;
  onOpenRecent: (book: StoredBook) => void;
  onOpenPlugins: () => void;
};

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function Welcome({
  recent,
  busy,
  onOpenFile,
  onOpenRecent,
  onOpenPlugins,
}: WelcomeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pickFile = (file: File | undefined) => {
    if (file) onOpenFile(file);
  };

  return (
    <div className="welcome">
      <div
        className={`welcome-card ${dragging ? "dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pickFile(event.dataTransfer.files[0]);
        }}
      >
        <div className="welcome-mark">
          <BookOpen size={30} strokeWidth={1.35} />
        </div>
        <h1>Quiet Reader</h1>
        <p className="welcome-lead">
          导入一本外刊 epub，按需启用词表，正文自动标出命中词汇。点词看释义，
          不会的词按天收进生词本，随时导出 Anki。
        </p>

        <div className="welcome-actions">
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <FolderOpen size={18} strokeWidth={1.6} />
            {busy ? "正在打开…" : "打开 epub"}
          </button>
          <button className="ghost-button" type="button" onClick={onOpenPlugins}>
            <Library size={18} strokeWidth={1.6} />
            词库管理
          </button>
        </div>

        <p className="welcome-drop">
          <Upload size={14} strokeWidth={1.6} />
          也可以把 .epub 文件拖到这里
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".epub,application/epub+zip"
          hidden
          onChange={(event) => {
            pickFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      {recent.length ? (
        <div className="recent-block">
          <div className="recent-title">最近打开</div>
          <div className="recent-list">
            {recent.slice(0, 5).map((book) => (
              <button
                className="recent-item"
                key={book.bookId}
                type="button"
                disabled={busy}
                onClick={() => onOpenRecent(book)}
              >
                <BookOpen size={17} strokeWidth={1.5} />
                <span className="recent-name">{book.title}</span>
                <span className="recent-date">{formatDate(book.savedAt)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
