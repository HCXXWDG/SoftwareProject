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
  /** 刷新趋势数据回调 */
  onRefresh?: () => void;
  /** 是否正在加载趋势数据 */
  loading?: boolean;
}

function stressColor(stress: number | null): string {
  if (stress == null) return "#94a3b8";
  if (stress <= 30) return "#22c55e";
  if (stress <= 60) return "#f59e0b";
  return "#ef4444";
}

/** Render a simple SVG line chart for trend data */
function TrendChart({ points }: { points: TrendResult["points"] }) {
  if (!points || points.length === 0) {
    return null;
  }

  const width = 400;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 20, left: 30 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Filter out points with null averageStress
  const validPoints = points.filter((p) => p.averageStress != null);
  if (validPoints.length === 0) {
    return null;
  }

  const maxStress = 100;
  const xStep = validPoints.length > 1 ? chartWidth / (validPoints.length - 1) : 0;

  const pathData = validPoints
    .map((point, index) => {
      const x = padding.left + index * xStep;
      const y = padding.top + chartHeight - (point.averageStress! / maxStress) * chartHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg
      className="trend-panel__chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="七日通勤趋势折线图"
    >
      {/* Y-axis labels */}
      <text x={5} y={padding.top + 4} fontSize="10" fill="#64748b">
        100
      </text>
      <text x={5} y={padding.top + chartHeight / 2 + 4} fontSize="10" fill="#64748b">
        50
      </text>
      <text x={5} y={padding.top + chartHeight + 4} fontSize="10" fill="#64748b">
        0
      </text>

      {/* Grid lines */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left + chartWidth}
        y2={padding.top}
        stroke="#e2e8f0"
        strokeWidth="1"
      />
      <line
        x1={padding.left}
        y1={padding.top + chartHeight / 2}
        x2={padding.left + chartWidth}
        y2={padding.top + chartHeight / 2}
        stroke="#e2e8f0"
        strokeWidth="1"
      />
      <line
        x1={padding.left}
        y1={padding.top + chartHeight}
        x2={padding.left + chartWidth}
        y2={padding.top + chartHeight}
        stroke="#e2e8f0"
        strokeWidth="1"
      />

      {/* Line path */}
      <path d={pathData} fill="none" stroke="#3b82f6" strokeWidth="2" />

      {/* Data points */}
      {validPoints.map((point, index) => {
        const x = padding.left + index * xStep;
        const y = padding.top + chartHeight - (point.averageStress! / maxStress) * chartHeight;
        return (
          <circle
            key={point.date}
            cx={x}
            cy={y}
            r="4"
            fill={stressColor(point.averageStress)}
            stroke="#fff"
            strokeWidth="2"
          >
            <title>
              {point.date}: 平均压力 {Math.round(point.averageStress!)}, {point.commuteCount} 次通勤
            </title>
          </circle>
        );
      })}

      {/* X-axis labels (show first, middle, and last dates) */}
      {validPoints.length > 0 && (
        <>
          <text
            x={padding.left}
            y={height - 5}
            fontSize="9"
            fill="#64748b"
            textAnchor="start"
          >
            {validPoints[0].date.slice(5)}
          </text>
          {validPoints.length > 2 && (
            <text
              x={padding.left + chartWidth / 2}
              y={height - 5}
              fontSize="9"
              fill="#64748b"
              textAnchor="middle"
            >
              {validPoints[Math.floor(validPoints.length / 2)].date.slice(5)}
            </text>
          )}
          {validPoints.length > 1 && (
            <text
              x={padding.left + chartWidth}
              y={height - 5}
              fontSize="9"
              fill="#64748b"
              textAnchor="end"
            >
              {validPoints[validPoints.length - 1].date.slice(5)}
            </text>
          )}
        </>
      )}
    </svg>
  );
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
  onRefresh,
  loading = false,
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
        {onRefresh && (
          <button
            className="trend-panel__refresh-btn"
            onClick={onRefresh}
            disabled={loading}
            type="button"
            aria-label="刷新趋势数据"
          >
            {loading ? "刷新中…" : "刷新"}
          </button>
        )}
      </div>

      {trend.points?.length > 0 && <TrendChart points={trend.points} />}

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
