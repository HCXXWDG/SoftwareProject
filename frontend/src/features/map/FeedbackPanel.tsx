import { useState } from "react";
import type { EmotionTag } from "../../types";

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
  { value: "OTHER", emoji: "💭", label: "其他" },
];

interface FeedbackPanelProps {
  position: { x: number; y: number };
  onSubmit: (stressLevel: number, tag: EmotionTag) => void;
  onCancel: () => void;
  submitting: boolean;
}

export function FeedbackPanel({
  position,
  onSubmit,
  onCancel,
  submitting,
}: FeedbackPanelProps) {
  const [stressLevel, setStressLevel] = useState<number | null>(null);
  const [tag, setTag] = useState<EmotionTag | null>(null);

  const canSubmit = stressLevel !== null && tag !== null && !submitting;

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit(stressLevel, tag);
    }
  };

  return (
    <div
      aria-label="情绪反馈面板"
      className="map-surface__feedback-panel"
      data-testid="feedback-panel"
      role="dialog"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
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

      <fieldset className="map-surface__feedback-group" disabled={submitting}>
        <legend>压力等级</legend>
        <div className="map-surface__feedback-buttons">
          {STRESS_LEVELS.map(({ value, emoji, label }) => (
            <button
              aria-label={`压力 ${value} ${label}`}
              aria-pressed={stressLevel === value}
              className="map-surface__feedback-btn"
              data-stress={value}
              key={value}
              onClick={() => setStressLevel(value)}
              type="button"
            >
              <span className="map-surface__feedback-emoji">{emoji}</span>
              <span className="map-surface__feedback-label">{label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="map-surface__feedback-group" disabled={submitting}>
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
    </div>
  );
}
