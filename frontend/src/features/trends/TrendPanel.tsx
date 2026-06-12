import type { TrendResult } from "../../types";
import "./TrendPanel.css";

interface TrendPanelProps {
  trend: TrendResult | null;
  /** 点击"完成本次通勤"按钮时触发 */
  onCompleteCommute?: () => void;
  /** 按钮是否处于加载状态 */
  completing?: boolean;
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
}: TrendPanelProps) {
  if (!trend || !Array.isArray(trend.points)) {
    return (
      <div className="trend-panel trend-panel--empty" data-testid="trend-panel">
        <p className="trend-panel__empty-text">暂无通勤趋势数据</p>
        {onCompleteCommute && (
          <button
            className="trend-panel__complete-btn"
            disabled={completing}
            onClick={onCompleteCommute}
            type="button"
          >
            {completing ? "提交中…" : "完成本次通勤"}
          </button>
        )}
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

      {onCompleteCommute && (
        <button
          className="trend-panel__complete-btn"
          disabled={completing}
          onClick={onCompleteCommute}
          type="button"
        >
          {completing ? "提交中…" : "完成本次通勤"}
        </button>
      )}
    </div>
  );
}
