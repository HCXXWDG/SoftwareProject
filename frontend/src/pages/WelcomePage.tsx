import { useEffect, useRef, useState } from "react";
import { CampusPointPicker } from "../features/map/CampusPointPicker";
import { isPointInBounds } from "../features/map/viewport";
import { CAMPUS, WAYPOINTS, type Waypoint } from "../config/campus";
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
  const [customPoints, setCustomPoints] = useState<Waypoint[]>([]);
  const [picking, setPicking] = useState<"起点" | "终点" | null>(null);
  const returnFocus = useRef<"起点" | "终点" | null>(null);
  const originPickRef = useRef<HTMLButtonElement>(null);
  const destPickRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!picking && returnFocus.current) {
      (returnFocus.current === "起点" ? originPickRef : destPickRef).current?.focus();
      returnFocus.current = null;
    }
  }, [picking]);
  const options = [...WAYPOINTS];
  for (const point of [initialOrigin, initialDestination]) {
    if (point && !options.some((option) => option.id === point.id)) options.push(point);
  }
  for (const point of customPoints) {
    const existing = options.findIndex(option => option.id === point.id);
    if (existing >= 0) options[existing] = point;
    else options.push(point);
  }

  const origin = options.find((w) => w.id === originId);
  const destination = options.find((w) => w.id === destId);
  const canGo = origin != null && destination != null
    && isPointInBounds(origin.point, CAMPUS.bounds) && isPointInBounds(destination.point, CAMPUS.bounds)
    && (origin.point.longitude !== destination.point.longitude || origin.point.latitude !== destination.point.latitude);
  const closePicker = () => {
    setPicking(null);
  };
  const selectPoint = (point: GeoPoint) => {
    if (!picking || !isPointInBounds(point, CAMPUS.bounds)) return;
    const id = `custom-${picking}-${point.longitude}-${point.latitude}`;
    const chosen = { id, name: `地图${picking}（${point.longitude.toFixed(5)}, ${point.latitude.toFixed(5)}）`, point };
    setCustomPoints(current => [...current.filter(option => option.id !== id), chosen]);
    if (picking === "起点") setOriginId(id); else setDestId(id);
    closePicker();
  };

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

  if (picking) return <CampusPointPicker target={picking}
    initialPoint={(picking === "起点" ? origin : destination)?.point ?? CAMPUS.center}
    onSelect={selectPoint} onCancel={closePicker} />;

  return (
    <div className="welcome-page">
      <div className="welcome-page__content">
        <h1 className="welcome-page__title">校园通勤情绪地图</h1>
        <p className="welcome-page__subtitle">
          江南大学蠡湖校区 · 通勤情绪可视化工具
        </p>
        <p className="welcome-page__instructions">在地图上自由选择校区内位置，或使用下方常用地点。</p>

        <div className="welcome-page__section">
          <p className="welcome-page__label">选择起点</p>
          <button className="welcome-page__map-pick" ref={originPickRef} type="button" onClick={() => { returnFocus.current = "起点"; setPicking("起点"); }}>地图选择起点</button>
          <div className="welcome-page__grid" role="group" aria-label="选择起点">
            {options.map((w) => renderPoint(w, w.id === originId, (id) => setOriginId(id)))}
          </div>
        </div>

        <div className="welcome-page__section">
          <p className="welcome-page__label">选择终点</p>
          <button className="welcome-page__map-pick" ref={destPickRef} type="button" onClick={() => { returnFocus.current = "终点"; setPicking("终点"); }}>地图选择终点</button>
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
