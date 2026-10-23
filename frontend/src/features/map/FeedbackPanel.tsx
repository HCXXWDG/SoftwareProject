import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { EmotionTag, GeoPoint } from "../../types";
import { scoreToColor } from "./viewport";
import "./FeedbackPanel.css";

const STRESS_LEVELS = [
  { value: 0, emoji: "😊", label: "轻松" },
  { value: 25, emoji: "🙂", label: "还好" },
  { value: 50, emoji: "😐", label: "一般" },
  { value: 75, emoji: "😟", label: "烦躁" },
  { value: 100, emoji: "😫", label: "崩溃" },
] as const;

const EMOTION_TAGS: { value: EmotionTag; emoji: string; label: string }[] = [
  { value: "NOISE", emoji: "🔊", label: "噪音" },
  { value: "CROWD", emoji: "👥", label: "拥挤" },
  { value: "SUN", emoji: "☀️", label: "暴晒" },
  { value: "ODOR", emoji: "👃", label: "异味" },
  { value: "QUIET", emoji: "🤫", label: "安静" },
  { value: "SHADE", emoji: "🌳", label: "树荫" },
  { value: "OPEN", emoji: "🏞️", label: "开阔" },
  { value: "OTHER", emoji: "💭", label: "其他" },
];

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(
    "button, [href], input, select, textarea, [tabindex]",
  )).filter((element) => element.tabIndex >= 0
    && !element.matches(":disabled")
    && !element.closest("[hidden], [inert]"));
}

interface FeedbackPanelProps {
  position: { x: number; y: number };
  location?: GeoPoint;
  onSubmit: (stressLevel: number, tag: EmotionTag) => void;
  onCancel: () => void;
  submitting: boolean;
  submissionEnabled?: boolean;
  error?: string | null;
  isDuplicate?: boolean;
  "data-position"?: string;
}

export function FeedbackPanel({
  position,
  location,
  onSubmit,
  onCancel,
  submitting,
  submissionEnabled = true,
  error,
  isDuplicate = false,
  "data-position": dataPosition,
}: FeedbackPanelProps) {
  const [stressLevel, setStressLevel] = useState<number | null>(null);
  const [tag, setTag] = useState<EmotionTag | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const canSubmit = stressLevel !== null && tag !== null
    && !submitting && !isDuplicate && submissionEnabled;

  useEffect(() => {
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    if (panel) (focusableElements(panel)[0] ?? panel).focus({ preventScroll: true });
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!submitting) onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      // Selection and submitting state can enable or disable buttons after mount.
      const elements = focusableElements(panel);
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      if (!first) {
        event.preventDefault();
        panel.focus();
      } else if (!elements.includes(active as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, submitting]);

  useEffect(() => {
    const panel = panelRef.current;
    const active = document.activeElement;
    // Browsers may blur a control as soon as it becomes disabled.
    if (panel && (submitting || isDuplicate || active === panel
      || (active instanceof HTMLElement && panel.contains(active) && active.matches(":disabled")))) {
      (focusableElements(panel)[0] ?? panel).focus();
    }
  }, [submitting, isDuplicate, submissionEnabled]);

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit(stressLevel, tag);
    }
  };

  return (
    <div
      aria-busy={submitting}
      aria-label="情绪反馈面板"
      className="map-surface__feedback-panel"
      data-position={dataPosition}
      data-testid="feedback-panel"
      ref={panelRef}
      role="dialog"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      tabIndex={-1}
    >
      <div className="map-surface__feedback-header">
        <span>这里感觉怎样？</span>
        <button
          aria-label="关闭反馈面板"
          className="map-surface__feedback-close"
          disabled={submitting}
          onClick={onCancel}
          type="button"
        >
          ✕
        </button>
      </div>

      {location && <p className="map-surface__feedback-location" aria-label="本条反馈位置">
        <strong>已选位置</strong> {location.longitude.toFixed(5)}, {location.latitude.toFixed(5)}
        <span>移动底图不会改变本条反馈的位置。</span>
      </p>}

      <fieldset className="map-surface__feedback-group" disabled={submitting || isDuplicate}>
        <legend>压力等级</legend>
        <div className="map-surface__feedback-buttons">
          {STRESS_LEVELS.map(({ value, emoji, label }) => (
            <button
              aria-label={`压力 ${value} ${label}`}
              aria-pressed={stressLevel === value}
              className="map-surface__feedback-btn"
              data-stress={value}
              style={{ "--stress-color": scoreToColor(value) } as CSSProperties}
              key={value}
              onClick={() => setStressLevel(value)}
              type="button"
            >
              <span className="map-surface__feedback-emoji">{emoji}</span>
              <span className="map-surface__feedback-label">{label}</span>
              <span className="map-surface__stress-swatch" aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="map-surface__feedback-group" disabled={submitting || isDuplicate}>
        <legend>主要原因</legend>
        <div className="map-surface__feedback-buttons">
          {EMOTION_TAGS.map(({ value, emoji, label }) => (
            <button
              aria-label={`原因 ${label}`}
              aria-pressed={tag === value}
              className="map-surface__feedback-btn"
              data-tag={value}
              key={value}
              onClick={() => setTag(value)}
              type="button"
            >
              <span className="map-surface__feedback-emoji">{emoji}</span>
              <span className="map-surface__feedback-label">{label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <button
        aria-label="提交反馈"
        className="map-surface__feedback-submit"
        disabled={!canSubmit}
        onClick={handleSubmit}
        type="button"
      >
        {submitting ? "提交中…" : "提交反馈"}
      </button>
      {error && <p className="map-surface__feedback-error" role="alert">{error}</p>}
      {isDuplicate && (
        <p className="map-surface__feedback-duplicate" role="status">
          五分钟内附近路段的反馈已记录，无需重复提交。
        </p>
      )}
      {!submissionEnabled && (
        <p className="map-surface__feedback-disabled" role="status">
          反馈服务暂不可用，草稿已保留，请恢复连接后提交。
        </p>
      )}
    </div>
  );
}
