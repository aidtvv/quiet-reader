import { useEffect, useRef, useState } from "react";
import { WindowControls } from "./Topbar";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileUp,
  Library,
  Minus,
  Moon,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Scan,
  Search,
  SunMedium,
} from "lucide-react";

type ToolbarProps = {
  fileName: string;
  position: { index: number; total: number } | null;
  zoom: number;
  light: boolean;
  leftPinned: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchCount: number;
  onToggleLeft: () => void;
  onOpenFile: () => void;
  onPrevArticle: () => void;
  onNextArticle: () => void;
  onZoomChange: (zoom: number) => void;
  onFitWidth: () => void;
  onToggleLight: () => void;
  onOpenSettings: () => void;
  onOpenVocab?: () => void;
  onToggleSearch: () => void;
  onSearchQuery: (value: string) => void;
  onSearchJump: () => void;
  onBackToShelf: () => void;
  onExportAnki: () => void;
  onDownloadArticle: () => void;
  onToast: (message: string) => void;
};

const ZOOMS = [50, 75, 100, 125, 150, 175, 200];

export function Toolbar({
  fileName,
  position,
  zoom,
  light,
  leftPinned,
  searchOpen,
  searchQuery,
  searchCount,
  onToggleLeft,
  onOpenFile,
  onPrevArticle,
  onNextArticle,
  onZoomChange,
  onFitWidth,
  onToggleLight,
  onOpenSettings,
  onOpenVocab,
  onToggleSearch,
  onSearchQuery,
  onSearchJump,
  onBackToShelf,
  onExportAnki,
  onDownloadArticle,
  onToast,
}: ToolbarProps) {
  const [zoomMenu, setZoomMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (searchOpen) {
      window.setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [searchOpen]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setZoomMenu(false);
        setMoreMenu(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setZoomMenu(false);
        setMoreMenu(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const closeMenus = () => {
    setZoomMenu(false);
    setMoreMenu(false);
  };

  const atStart = !position || position.index <= 0;
  const atEnd = !position || position.index >= position.total - 1;

  return (
    <header
      className="toolbar"
      ref={headerRef}
      onClick={closeMenus}
      data-tauri-drag-region
    >
      <div className="tb-left" onClick={(event) => event.stopPropagation()}>
        <button
          className="icon-button"
          type="button"
          title="返回书架"
          onClick={onBackToShelf}
        >
          <Library size={19} strokeWidth={1.55} />
        </button>
        <button
          className={`icon-button ${leftPinned ? "active" : ""}`}
          type="button"
          title={leftPinned ? "取消固定文档导航" : "固定文档导航（未固定时靠近左边缘展开）"}
          onClick={onToggleLeft}
        >
          <PanelLeft size={20} strokeWidth={1.55} />
        </button>
        <span className="tb-divider" />
        <span className="file-name" title={fileName} data-tauri-drag-region>
          {fileName}
        </span>
        <button className="icon-button" type="button" title="打开另一本 epub" onClick={onOpenFile}>
          <FileUp size={18} strokeWidth={1.6} />
        </button>
      </div>

      <div className="tb-center" onClick={(event) => event.stopPropagation()}>
        <button
          className="icon-button"
          type="button"
          title="上一篇"
          disabled={atStart}
          onClick={onPrevArticle}
        >
          <ChevronLeft size={20} strokeWidth={1.6} />
        </button>
        <span className="article-position">
          {position ? `${position.index + 1} / ${position.total}` : "— / —"}
        </span>
        <button
          className="icon-button"
          type="button"
          title="下一篇"
          disabled={atEnd}
          onClick={onNextArticle}
        >
          <ChevronRight size={20} strokeWidth={1.6} />
        </button>
        <span className="tb-divider narrow" />
        <button
          className="icon-button"
          type="button"
          title="缩小"
          onClick={() => onZoomChange(Math.max(40, zoom - 10))}
        >
          <Minus size={20} strokeWidth={1.6} />
        </button>
        <button
          className={`zoom-label ${zoomMenu ? "is-open" : ""}`}
          type="button"
          onClick={() => {
            setMoreMenu(false);
            setZoomMenu((open) => !open);
          }}
        >
          {zoom}%
          <ChevronDown size={14} strokeWidth={1.7} />
        </button>
        <button
          className="icon-button"
          type="button"
          title="放大"
          onClick={() => onZoomChange(Math.min(240, zoom + 10))}
        >
          <Plus size={20} strokeWidth={1.6} />
        </button>
        <button className="icon-button" type="button" title="适合宽度" onClick={onFitWidth}>
          <Scan size={20} strokeWidth={1.55} />
        </button>

        {zoomMenu ? (
          <div className="popover zoom-menu">
            <div className="popover-title">缩放</div>
            {ZOOMS.map((value) => (
              <button
                className={`popover-row ${value === zoom ? "selected" : ""}`}
                key={value}
                type="button"
                onClick={() => {
                  onZoomChange(value);
                  setZoomMenu(false);
                }}
              >
                <span>{value}%</span>
                {value === zoom ? <span className="popover-check">✓</span> : null}
              </button>
            ))}
            <button
              className="popover-row"
              type="button"
              onClick={() => {
                onFitWidth();
                setZoomMenu(false);
              }}
            >
              适合宽度
            </button>
          </div>
        ) : null}
      </div>

      <div className="tb-right" onClick={(event) => event.stopPropagation()}>
        <button
          className={`icon-button ${searchOpen ? "active" : ""}`}
          type="button"
          title="在当前文章中搜索"
          onClick={onToggleSearch}
        >
          <Search size={20} strokeWidth={1.55} />
        </button>
        <span className="tb-divider narrow" />
        <button
          className={`icon-button ${light ? "active" : ""}`}
          type="button"
          title={light ? "切换为深色模式" : "切换为浅色模式"}
          onClick={onToggleLight}
        >
          {light ? <Moon size={19} strokeWidth={1.55} /> : <SunMedium size={20} strokeWidth={1.55} />}
        </button>
        <button
          className={`icon-button ${moreMenu ? "active" : ""}`}
          type="button"
          title="更多"
          onClick={() => {
            setZoomMenu(false);
            setMoreMenu((open) => !open);
          }}
        >
          <MoreHorizontal size={20} strokeWidth={1.7} />
        </button>

        {moreMenu ? (
          <div className="popover more-menu">
            <button
              className="popover-row"
              type="button"
              onClick={() => {
                onBackToShelf();
                setMoreMenu(false);
              }}
            >
              返回书架
            </button>
            <div className="popover-sep" />
            <button
              className="popover-row"
              type="button"
              onClick={() => {
                onExportAnki();
                setMoreMenu(false);
              }}
            >
              导出 Anki（全部生词）
            </button>
            <button
              className="popover-row"
              type="button"
              onClick={() => {
                onDownloadArticle();
                setMoreMenu(false);
              }}
            >
              导出当前文章文本
            </button>
            <div className="popover-sep" />
            <button
              className="popover-row"
              type="button"
              onClick={() => {
                onZoomChange(100);
                setMoreMenu(false);
              }}
            >
              重置缩放
            </button>
            <div className="popover-sep" />
            {onOpenVocab ? (
              <button
                className="popover-row"
                type="button"
                onClick={() => {
                  onOpenVocab();
                  setMoreMenu(false);
                }}
              >
                生词本
              </button>
            ) : null}
            <button
              className="popover-row"
              type="button"
              onClick={() => {
                onOpenSettings();
                setMoreMenu(false);
              }}
            >
              设置…
            </button>
            <div className="popover-sep" />
            <button
              className="popover-row muted-row"
              type="button"
              onClick={() => {
                onToast("快捷键：Ctrl + F 搜索，Ctrl + 加号 / 减号缩放");
                setMoreMenu(false);
              }}
            >
              键盘快捷键
            </button>
            <button
              className="popover-row muted-row"
              type="button"
              onClick={() => {
                onToast("Quiet Reader · Tauri + React");
                setMoreMenu(false);
              }}
            >
              关于 Quiet Reader
            </button>
          </div>
        ) : null}

        {searchOpen ? (
          <div className="search-popover">
            <Search size={15} strokeWidth={1.7} />
            <input
              ref={searchRef}
              value={searchQuery}
              placeholder="搜索当前文章"
              onChange={(event) => onSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearchJump();
                if (event.key === "Escape") onToggleSearch();
              }}
            />
            <span className="search-count">
              {searchQuery ? `${searchCount} 处` : "Enter 跳转"}
            </span>
          </div>
        ) : null}

        <button
          className="icon-button"
          type="button"
          title="导出 Anki"
          onClick={onExportAnki}
        >
          <Download size={20} strokeWidth={1.55} />
        </button>
      </div>

      <WindowControls className="reader-winctl" />
    </header>
  );
}
