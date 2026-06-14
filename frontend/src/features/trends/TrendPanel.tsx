import type { TrendResult } from "../../types";
import "./TrendPanel.css";

/** 后端允许的五档压力值 */
const STRESS_LEVELS = [0, 25, 50, 75, 100] as const;

const STRESS_LABELS: Record<number, string> = {
  0: "非常轻松",
  25: "比较轻松",
  50: "一般",
  75: "有些心累",
  100: "非常心累",
};

interface TrendPanelProps {
  trend: TrendResult | null;
  /** 点击"完成本次通勤"按钮时触发 */
  onCompleteCommute?: () => void;
  /** 按钮是否处于加载状态 */
  completing?: boolean;
  /** 后端返回的错误信息 */
  error?: string | null;
  /** 外部控制按钮禁用状态（如路线未加载） */
  disabled?: boolean;
  /** 用户选择的真实压力档位（null 表示未选） */
  userStressLevel?: number | null;
  /** 用户点击压力档位时回调 */
  onStressLevelChange?: (level: number) => void;
  /** 通勤已记录但趋势刷新失败时的警告信息 */
  trendRefreshWarning?: string | null;
}

function stressColor(stress: number | null): string {
  if (stress == null) return "#94a3b8";
  if (stress <= 30) return "#22c55e";
  if (stress <= 60) return "#f59e0b";
  return "#ef4444";
}

export function TrendPanel({
  trend,
  onCompleteCommute,
  completing = false,
  error = null,
  disabled = false,
  userStressLevel = null,
  onStressLevelChange,
  trendRefreshWarning = null,
}: TrendPanelProps) {
  /** 压力档位选择器（用户结束通勤后填写真实感受） */
  const stressSelector = onStressLevelChange && (
    <fieldset
      className="trend-panel__stress-selector"
      data-testid="stress-level-selector"
      disabled={completing}
    >
      <legend className="trend-panel__stress-legend">本次通勤结束后的压力感受</legend>
      <div className="trend-panel__stress-buttons">
        {STRESS_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={`trend-panel__stress-btn ${userStressLevel === level ? "trend-panel__stress-btn--active" : ""}`}
            onClick={() => onStressLevelChange(level)}
            aria-pressed={userStressLevel === level}
            title={STRESS_LABELS[level]}
          >
            {level}
          </button>
        ))}
      </div>
      <div className="trend-panel__stress-labels">
        <span>非常轻松</span>
        <span>非常心累</span>
      </div>
    </fieldset>
  );

  /** 按钮：须选择压力档位后才能提交 */
  const completeButton = onCompleteCommute && (
    <button
      className="trend-panel__complete-btn"
      disabled={completing || disabled || userStressLevel == null}
      onClick={onCompleteCommute}
      type="button"
      title={userStressLevel == null ? "请先选择本次通勤的压力感受" : undefined}
    >
      {completing ? "提交中…" : "完成本次通勤"}
    </button>
  );

  if (!trend || !Array.isArray(trend.points)) {
    return (
      <div className="trend-panel trend-panel--empty" data-testid="trend-panel">
        <p className="trend-panel__empty-text">暂无通勤趋势数据</p>
        {stressSelector}
        {error && (
          <p className="trend-panel__error" role="alert">
            {error}
          </p>
        )}
        {trendRefreshWarning && (
          <p className="trend-panel__warning" role="status">
            ⚠️ {trendRefreshWarning}
          </p>
        )}
        {completeButton}
      </div>
    );
  }

  return (
    <div className="trend-panel" data-testid="trend-panel">
      <div className="trend-panel__header">
        <h3 className="trend-panel__title">七日通勤趋势</h3>
        <span className="trend-panel__count">
          共 {trend.totalCommutes} 次通勤
        </span>
      </div>

      {trend.points?.length > 0 && (
        <table className="trend-panel__table">
          <thead>
            <tr>
              <th>日期</th>
              <th>平均压力</th>
              <th>通勤次数</th>
            </tr>
          </thead>
          <tbody>
            {trend.points.map((point) => (
              <tr key={point.date}>
                <td>{point.date}</td>
                <td>
                  <span
                    className="trend-panel__stress-dot"
                    style={{ backgroundColor: stressColor(point.averageStress) }}
                  />
                  {point.averageStress != null
                    ? Math.round(point.averageStress)
                    : "—"}
                </td>
                <td>{point.commuteCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {trend.recommendation && (
        <p className="trend-panel__recommendation" role="status">
          💡 {trend.recommendation}
        </p>
      )}

      {stressSelector}

      {error && (
        <p className="trend-panel__error" role="alert">
          {error}
        </p>
      )}

      {trendRefreshWarning && (
        <p className="trend-panel__warning" role="status">
          ⚠️ {trendRefreshWarning}
        </p>
      )}

      {completeButton}
    </div>
  );
}
