import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type TopbarNavItem = {
  key: string;
  label: string;
  active?: boolean;
  onClick: () => void;
};

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 应用 logo（外刊阅读图标，单色版），颜色跟随顶栏强调色。 */
export function AppLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="shelf-logo"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M76 32 H180 A44 44 0 0 1 224 76 V180 A44 44 0 0 1 180 224 H76 A44 44 0 0 1 32 180 V76 A44 44 0 0 1 76 32 Z M88 80 A12 12 0 1 1 87.9 80 Z M160 32 L224 96 L224 112 L160 48 Z M64 120 H192 V134 H64 Z M64 146 H168 V160 H64 Z M64 172 H136 V186 H64 Z"
      />
    </svg>
  );
}

/** 无边框窗口自绘的最小化 / 最大化 / 关闭。 */
export function WindowControls({ className }: { className?: string }) {
  if (!inTauri()) return null;
  const win = getCurrentWindow();
  return (
    <div className={`topbar-winctl${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        aria-label="最小化"
        title="最小化"
        onClick={() => void win.minimize()}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6h8" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="最大化"
        title="最大化 / 还原"
        onClick={() => void win.toggleMaximize()}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <rect
            x="2.5"
            y="2.5"
            width="7"
            height="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      </button>
      <button
        type="button"
        className="close"
        aria-label="关闭"
        title="关闭"
        onClick={() => void win.close()}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}

/**
 * 一体化极简顶栏（48px）。窗口是无边框的，整条顶栏可拖动，
 * 右侧的最小化/最大化/关闭由前端绘制。
 */
export function Topbar({
  nav,
  right,
}: {
  nav: TopbarNavItem[];
  /** 顶栏右侧的页面专属控件（搜索、导入、视图切换等）。 */
  right?: ReactNode;
}) {
  return (
    <header className="shelf-toolbar" data-tauri-drag-region>
      <div className="shelf-brand" data-tauri-drag-region>
        <AppLogo />
        <span>Quiet Reader</span>
      </div>

      <span className="shelf-divider" />

      <nav className="shelf-nav" aria-label="主导航">
        {nav.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`shelf-nav-item${item.active ? " active" : ""}`}
            aria-current={item.active ? "page" : undefined}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {right ? <div className="shelf-right">{right}</div> : null}

      <WindowControls />
    </header>
  );
}
