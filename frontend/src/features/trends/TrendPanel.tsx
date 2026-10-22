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
  /** Optional for hosts without A's separate query controls. */
  onRefresh?: () => void;
  loading?: boolean;
}

function stressColor(stress: number | null): string {
  if (stress == null) return "#94a3b8";
  if (stress <= 30) return "#22c55e";
  if (stress <= 60) return "#f59e0b";
  return "#ef4444";
}

/** Keep calendar spacing and break the line at missing observations. */
function TrendChart({ points }: { points: TrendResult["points"] }) {
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const dayMs = 86_400_000;
  const width = 400;
  const height = 120;
  const left = 30;
  const top = 10;
  const chartWidth = 360;
  const chartHeight = 90;
  const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const firstDay = ordered.length ? dayOf(ordered[0].date) : Number.NaN;
  const lastDay = ordered.length ? dayOf(ordered[ordered.length - 1].date) : Number.NaN;
  const dateSpan = lastDay - firstDay;
  const xOf = (day: number) => dateSpan > 0
    ? left + (day - firstDay) / dateSpan * chartWidth
    : left + chartWidth / 2;

  let previousDay: number | null = null;
  const plotted = ordered.flatMap((point) => {
    const day = dayOf(point.date);
    const stress = point.averageStress;
    if (!Number.isFinite(day) || stress == null || !Number.isFinite(stress) || stress < 0 || stress > 100) {
      previousDay = null;
      return [];
    }
    const command = previousDay !== null && day - previousDay === dayMs ? "L" : "M";
    previousDay = day;
    return [{ point, stress, x: xOf(day), y: top + chartHeight * (1 - stress / 100), command }];
  });

  if (!plotted.length || !Number.isFinite(firstDay) || !Number.isFinite(lastDay)) {
    return <p className="trend-panel__empty-text" role="status">暂无可绘制的压力数据</p>;
  }

  const pathData = plotted.map(({ x, y, command }) => `${command} ${x} ${y}`).join(" ");
  const tickDays = [...new Set([
    firstDay,
    firstDay + Math.floor(dateSpan / dayMs / 2) * dayMs,
    lastDay,
  ])];

  return (
    <svg className="trend-panel__chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="七日通勤趋势折线图">
      <desc>仅连接相邻日期的压力记录；没有数据的日期保留空缺。</desc>
      {[100, 50, 0].map((stress) => {
        const y = top + chartHeight * (1 - stress / 100);
        return <g key={stress}>
          <text x={5} y={y + 4} fontSize="10" fill="#64748b" aria-hidden="true">{stress}</text>
          <line x1={left} y1={y} x2={left + chartWidth} y2={y} stroke="#e2e8f0" />
        </g>;
      })}
      <path d={pathData} fill="none" stroke="#3b82f6" strokeWidth="2" />
      {plotted.map(({ point, stress, x, y }) => (
        <circle key={point.date} cx={x} cy={y} r="4" fill={stressColor(point.averageStress)} stroke="#fff" strokeWidth="2">
          <title>{point.date}: 平均压力 {Math.round(stress)}, {point.commuteCount} 次通勤</title>
        </circle>
      ))}
      {tickDays.map((day) => (
        <text key={day} x={xOf(day)} y={height - 5} fontSize="9" fill="#64748b"
          textAnchor={dateSpan === 0 ? "middle" : day === firstDay ? "start" : day === lastDay ? "end" : "middle"}>
          {new Date(day).toISOString().slice(5, 10)}
        </text>
      ))}
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
  const refreshButton = onRefresh && (
    <button className="trend-panel__refresh-btn" onClick={onRefresh} disabled={loading}
      type="button" aria-label="刷新趋势数据">
      {loading ? "刷新中…" : "刷新"}
    </button>
  );
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
        {refreshButton}
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
        {refreshButton}
      </div>

      <TrendChart points={trend.points} />

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
