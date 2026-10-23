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
      <header className="welcome-page__masthead">
        <span className="welcome-page__brand"><svg aria-hidden="true" viewBox="0 0 32 32"><path d="M7 23C7 12 13 7 25 7c0 12-5 18-16 18" /><path d="m9 23 12-12M13 19v-6m4 2h6" /></svg>心途<span>走一段，轻松一点</span></span>
        <span className="welcome-page__campus">江南大学 · 蠡湖校区</span>
      </header>
      <main className="welcome-page__content">
      <section className="welcome-page__intro">
        <p className="welcome-page__eyebrow">从校园的任何一处出发</p>
        <h1 className="welcome-page__title">校园通勤情绪地图</h1>
        <p className="welcome-page__subtitle">
          选一段步行路线，看看沿途的情绪风景。<br />让每一次校园通勤，都多一点从容。
        </p>
        <svg className="welcome-page__illustration" viewBox="0 0 440 280" aria-hidden="true">
          <rect x="8" y="12" width="424" height="252" rx="32" fill="#e8eee6" />
          <path d="M8 186c73-30 113 15 175-7s110-44 249-20v105H8Z" fill="#d8e6cf" />
          <path d="m55 247 84-79 82 23 65-98 105-49" fill="none" stroke="#fafcf8" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m55 247 84-79 82 23 65-98 105-49" fill="none" stroke="#18694f" strokeWidth="4" strokeDasharray="2 11" strokeLinecap="round" />
          <rect x="46" y="66" width="104" height="66" rx="8" fill="#fbfcf7" stroke="#bacfba" strokeWidth="2" />
          <path d="M38 70 98 40l60 30" fill="#d9ef6d" stroke="#bacfba" strokeWidth="2" strokeLinejoin="round" />
          <path d="M66 87h13m19 0h13m19 0h7M66 108h13m19 0h13m19 0h7" stroke="#a6c3ad" strokeWidth="8" />
          <rect x="303" y="169" width="77" height="57" rx="8" fill="#fbfcf7" stroke="#bacfba" strokeWidth="2" />
          <path d="M315 189h12m17 0h12m-41 18h12m17 0h12" stroke="#a6c3ad" strokeWidth="7" />
          <path d="M206 102v39m-22-47c0-32 44-32 44 0 0 30-44 30-44 0Z" fill="#b6cdb6" stroke="#92b49b" strokeWidth="2" />
          <path d="M264 221v26m-15-41c0-23 30-23 30 0 0 21-30 21-30 0Z" fill="#b6cdb6" stroke="#92b49b" strokeWidth="2" />
          <circle cx="55" cy="247" r="9" fill="#fff" stroke="#18694f" strokeWidth="4" />
          <circle cx="391" cy="44" r="13" fill="#d9ef6d" stroke="#18694f" strokeWidth="3" />
          <circle cx="391" cy="44" r="4" fill="#18694f" />
        </svg>
        <p className="welcome-page__caption"><span /> 自由选点 · 步行规划 · 情绪反馈</p>
      </section>
      <section className="welcome-page__planner" aria-label="规划校园步行路线">
        <div className="welcome-page__planner-heading"><span className="welcome-page__step">01</span><h2>今天，想走到哪里？</h2></div>
        <p className="welcome-page__instructions">在地图上自由选择校区内位置，或使用下方常用地点。</p>

        <div className="welcome-page__section">
          <p className="welcome-page__label"><span className="welcome-page__location-dot" />选择起点<span className="welcome-page__label-note">从哪里出发</span></p>
          <button className="welcome-page__map-pick" ref={originPickRef} type="button" onClick={() => { returnFocus.current = "起点"; setPicking("起点"); }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15" /></svg>地图选择起点<span aria-hidden="true">↗</span></button>
          <p className="welcome-page__shortcuts">常用地点</p>
          <div className="welcome-page__grid" role="group" aria-label="选择起点">
            {options.map((w) => renderPoint(w, w.id === originId, (id) => setOriginId(id)))}
          </div>
        </div>

        <div className="welcome-page__section">
          <p className="welcome-page__label"><span className="welcome-page__location-dot welcome-page__location-dot--destination" />选择终点<span className="welcome-page__label-note">在哪里停留</span></p>
          <button className="welcome-page__map-pick" ref={destPickRef} type="button" onClick={() => { returnFocus.current = "终点"; setPicking("终点"); }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15" /></svg>地图选择终点<span aria-hidden="true">↗</span></button>
          <p className="welcome-page__shortcuts">常用地点</p>
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
        <p className="welcome-page__footnote">每一条反馈，都是了解校园的一小步。</p>
      </section>
      </main>
    </div>
  );
}
