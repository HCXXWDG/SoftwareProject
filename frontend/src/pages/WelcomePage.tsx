import { useState } from "react";
import { WAYPOINTS, type Waypoint } from "../config/campus";
import type { GeoPoint } from "../types";
import "./WelcomePage.css";

interface WelcomePageProps {
  initialOriginId?: string;
  initialDestinationId?: string;
  initialOrigin?: Waypoint;
  initialDestination?: Waypoint;
  onNavigateToPreview: (
    origin: GeoPoint,
    destination: GeoPoint,
    originName: string,
    destName: string,
  ) => void;
}

export function WelcomePage({ onNavigateToPreview, initialOriginId = "dorm", initialDestinationId = "teaching", initialOrigin, initialDestination }: WelcomePageProps) {
  const [originId, setOriginId] = useState(initialOrigin?.id ?? initialOriginId);
  const [destId, setDestId] = useState(initialDestination?.id ?? initialDestinationId);
  const options = [...WAYPOINTS];
  for (const point of [initialOrigin, initialDestination]) {
    if (point && !options.some((option) => option.id === point.id)) options.push(point);
  }

  const origin = options.find((w) => w.id === originId);
  const destination = options.find((w) => w.id === destId);
  const canGo = origin != null && destination != null && (origin.point.longitude !== destination.point.longitude || origin.point.latitude !== destination.point.latitude);

  const handleGo = () => {
    if (!origin || !destination || !canGo) return;
    onNavigateToPreview(origin.point, destination.point, origin.name, destination.name);
  };

  const renderPoint = (w: Waypoint, selected: boolean, onSelect: (id: string) => void) => (
    <button
      key={w.id}
      className={`welcome-page__point ${selected ? "welcome-page__point--selected" : ""}`}
      aria-pressed={selected}
      onClick={() => onSelect(w.id)}
      type="button"
    >
      {w.name}
    </button>
  );

  return (
    <div className="welcome-page">
      <div className="welcome-page__content">
        <h1 className="welcome-page__title">校园通勤情绪地图</h1>
        <p className="welcome-page__subtitle">
          江南大学蠡湖校区 · 通勤情绪可视化工具
        </p>

        <div className="welcome-page__section">
          <p className="welcome-page__label">选择起点</p>
          <div className="welcome-page__grid" role="group" aria-label="选择起点">
            {options.map((w) => renderPoint(w, w.id === originId, (id) => setOriginId(id)))}
          </div>
        </div>

        <div className="welcome-page__section">
          <p className="welcome-page__label">选择终点</p>
          <div className="welcome-page__grid" role="group" aria-label="选择终点">
            {options.map((w) => renderPoint(w, w.id === destId, (id) => setDestId(id)))}
          </div>
        </div>

        {origin && destination && (
          <p className="welcome-page__route-hint">
            从 <strong>{origin.name}</strong> 到 <strong>{destination.name}</strong>
          </p>
        )}

        <button
          className="welcome-page__cta"
          disabled={!canGo}
          onClick={handleGo}
          type="button"
        >
          查看路线
        </button>
      </div>
    </div>
  );
}
