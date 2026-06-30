import { CAMPUS_POINTS } from "../config/campus";
import type { GeoPoint } from "../types";
import "./WelcomePage.css";

interface WelcomePageProps {
  originPoint: GeoPoint | null;
  destPoint: GeoPoint | null;
  originName: string;
  destName: string;
  onOriginChange: (point: GeoPoint, name: string) => void;
  onDestChange: (point: GeoPoint, name: string) => void;
  onNavigateToPreview: () => void;
}

/**
 * 欢迎页 — 三阶段流程的第一阶段。
 * 起终点双列表选择器：用户从 5 个校园点位中分别选择起点和终点。
 * 不发任何 API 请求。
 */
export function WelcomePage({
  originPoint,
  destPoint,
  originName,
  destName,
  onOriginChange,
  onDestChange,
  onNavigateToPreview,
}: WelcomePageProps) {
  const canNavigate = originPoint !== null && destPoint !== null;

  return (
    <div className="welcome-page">
      <div className="welcome-page__content">
        <h1 className="welcome-page__title">校园通勤情绪地图</h1>
        <p className="welcome-page__subtitle">
          江南大学蠡湖校区 · 通勤情绪可视化工具
        </p>

        {/* 起点选择 */}
        <div className="welcome-page__selector">
          <h3 className="welcome-page__selector-label">
            <span className="welcome-page__dot welcome-page__dot--origin" />
            选择起点
          </h3>
          <div className="welcome-page__grid">
            {CAMPUS_POINTS.map((cp) => (
              <button
                key={`origin-${cp.id}`}
                className={`welcome-page__point-btn ${
                  originPoint === cp.point ? "welcome-page__point-btn--active-origin" : ""
                } ${destPoint === cp.point ? "welcome-page__point-btn--disabled" : ""}`}
                disabled={destPoint === cp.point}
                onClick={() => onOriginChange(cp.point, cp.name)}
                type="button"
              >
                {cp.name}
              </button>
            ))}
          </div>
        </div>

        {/* 终点选择 */}
        <div className="welcome-page__selector">
          <h3 className="welcome-page__selector-label">
            <span className="welcome-page__dot welcome-page__dot--dest" />
            选择终点
          </h3>
          <div className="welcome-page__grid">
            {CAMPUS_POINTS.map((cp) => (
              <button
                key={`dest-${cp.id}`}
                className={`welcome-page__point-btn ${
                  destPoint === cp.point ? "welcome-page__point-btn--active-dest" : ""
                } ${originPoint === cp.point ? "welcome-page__point-btn--disabled" : ""}`}
                disabled={originPoint === cp.point}
                onClick={() => onDestChange(cp.point, cp.name)}
                type="button"
              >
                {cp.name}
              </button>
            ))}
          </div>
        </div>

        {/* 选择提示 */}
        <div className="welcome-page__summary">
          {canNavigate ? (
            <span>
              从 <strong>{originName}</strong> 到 <strong>{destName}</strong>
            </span>
          ) : (
            <span className="welcome-page__summary-hint">
              请分别选择起点和终点
            </span>
          )}
        </div>

        <button
          className="welcome-page__cta"
          disabled={!canNavigate}
          onClick={onNavigateToPreview}
          type="button"
        >
          查看推荐路线
        </button>
      </div>
    </div>
  );
}
