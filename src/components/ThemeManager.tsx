import { Check, Palette, X } from "lucide-react";
import { THEME_LIST, themeLabel } from "../lib/themes";

type ThemeManagerProps = {
  current: string;
  onPick: (key: string) => void;
  onClose: () => void;
};

export function ThemeManager({ current, onPick, onClose }: ThemeManagerProps) {
  const darkThemes = THEME_LIST.filter((theme) => theme.dark);
  const lightThemes = THEME_LIST.filter((theme) => !theme.dark);

  const renderGroup = (title: string, hint: string, themes: typeof THEME_LIST) => (
    <section className="theme-group">
      <div className="theme-group-head">
        <span className="section-label">{title}</span>
        <span className="theme-group-hint">{hint}</span>
      </div>
      <div className="theme-grid">
        {themes.map((theme) => {
          const selected = theme.key === current;
          return (
            <button
              className={`theme-card ${selected ? "selected" : ""}`}
              key={theme.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(theme.key)}
            >
              <span
                className="theme-swatch"
                style={{
                  background: `linear-gradient(135deg, ${theme.swatch[0]} 0%, ${theme.swatch[1]} 55%, ${theme.swatch[2]} 100%)`,
                }}
                aria-hidden="true"
              />
              <span className="theme-card-meta">
                <span className="theme-card-name">{theme.label}</span>
                <span className="theme-card-mode">{theme.dark ? "深色" : "浅色"}</span>
              </span>
              {selected ? (
                <span className="theme-card-check">
                  <Check size={13} strokeWidth={2.2} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal theme-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <Palette size={19} strokeWidth={1.6} />
          <span className="modal-title">外观主题</span>
          <span className="modal-sub">当前 · {themeLabel(current)}</span>
          <button
            className="icon-button small"
            type="button"
            title="关闭"
            onClick={onClose}
          >
            <X size={17} strokeWidth={1.7} />
          </button>
        </div>

        <div className="modal-body theme-modal-body">
          <p className="theme-intro">
            主题只改变界面配色与阅读纸色，不影响你的书、生词本和设置。深色与浅色主题各记一套，
            用工具栏的太阳按钮切换外观模式时会自动换回对应的一套。
          </p>
          {renderGroup("深色主题", `${darkThemes.length} 套`, darkThemes)}
          {renderGroup("浅色主题", `${lightThemes.length} 套`, lightThemes)}
        </div>

        <div className="modal-foot">
          主题由语义 token 驱动：背景、面板、纸面、强调色、状态色一起切换。
        </div>
      </div>
    </div>
  );
}
