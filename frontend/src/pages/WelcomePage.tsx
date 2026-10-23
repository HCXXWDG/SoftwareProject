import { useEffect, useRef, useState } from "react";
import { CampusPointPicker } from "../features/map/CampusPointPicker";
import { isPointInBounds } from "../features/map/viewport";
import { SERVICE_AREA, DEFAULT_ORIGIN, DEFAULT_DESTINATION, WAYPOINTS, type Waypoint } from "../config/serviceArea";
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

export function WelcomePage({ onNavigateToPreview, initialOriginId = DEFAULT_ORIGIN.id, initialDestinationId = DEFAULT_DESTINATION.id, initialOrigin, initialDestination }: WelcomePageProps) {
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
    && isPointInBounds(origin.point, SERVICE_AREA.bounds) && isPointInBounds(destination.point, SERVICE_AREA.bounds)
    && (origin.point.longitude !== destination.point.longitude || origin.point.latitude !== destination.point.latitude);
  const selectionHint = canGo ? null : origin && destination
    && origin.point.longitude === destination.point.longitude && origin.point.latitude === destination.point.latitude
    ? "起点与终点相同，请选择不同的位置。"
    : "请在地图上选择梁溪区范围内的起点和终点。";
  const closePicker = () => {
    setPicking(null);
  };
  const selectPoint = (point: GeoPoint) => {
    if (!picking || !isPointInBounds(point, SERVICE_AREA.bounds)) return;
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
    initialPoint={(picking === "起点" ? origin : destination)?.point ?? SERVICE_AREA.center}
    onSelect={selectPoint} onCancel={closePicker} />;

  return (
    <div className="welcome-page">
      <header className="welcome-page__masthead">
        <span className="welcome-page__brand"><svg aria-hidden="true" viewBox="0 0 32 32"><path d="M7 23C7 12 13 7 25 7c0 12-5 18-16 18" /><path d="m9 23 12-12M13 19v-6m4 2h6" /></svg>心途<span>走一段，轻松一点</span></span>
        <span className="welcome-page__region">无锡 · 梁溪区</span>
      </header>
      <main className="welcome-page__content">
      <section className="welcome-page__intro">
        <p className="welcome-page__eyebrow">从熟悉的街区，走向日常</p>
        <h1 className="welcome-page__title">心途——通勤情绪地图</h1>
        <p className="welcome-page__subtitle">
          选一段步行路线，看看沿途的情绪风景。<br />让每一次日常通勤，都多一点从容。
        </p>
        <svg className="welcome-page__illustration" viewBox="0 0 440 280" aria-hidden="true">
          <rect x="8" y="12" width="424" height="252" rx="32" fill="#e8eee6" />
          <path d="M8 197c70-31 128 18 195-6s137-32 229-2v75H8Z" fill="#d8e6cf" />
          <path d="M18 148h404M172 24v228m99-228v228" fill="none" stroke="#fafcf8" strokeWidth="22" />
          <rect x="40" y="48" width="49" height="78" rx="5" fill="#fbfcf7" stroke="#bacfba" strokeWidth="2" />
          <rect x="97" y="70" width="48" height="56" rx="5" fill="#cedfce" stroke="#bacfba" strokeWidth="2" />
          <path d="M52 64h8m9 0h8M52 82h8m9 0h8M52 100h8m9 0h8M108 85h8m9 0h8m-25 19h8m9 0h8" stroke="#93b29c" strokeWidth="5" />
          <rect x="294" y="44" width="39" height="82" rx="5" fill="#d9ef6d" stroke="#bacfba" strokeWidth="2" />
          <rect x="341" y="68" width="60" height="58" rx="5" fill="#fbfcf7" stroke="#bacfba" strokeWidth="2" />
          <path d="M305 61h16m-16 18h16m-16 18h16m31-13h10m13 0h10m-33 19h10m13 0h10" stroke="#93b29c" strokeWidth="5" />
          <rect x="297" y="177" width="107" height="61" rx="17" fill="#c1d7b7" />
          <path d="m316 223 61-31" stroke="#f5f8ed" strokeWidth="9" strokeLinecap="round" />
          <path d="M61 205v29m-17-42c0-25 34-25 34 0 0 24-34 24-34 0ZM118 194v24m-15-37c0-23 30-23 30 0 0 21-30 21-30 0ZM353 179v21m-13-33c0-20 26-20 26 0 0 20-26 20-26 0Z" fill="#a9c4a9" stroke="#86aa90" strokeWidth="2" />
          <path d="M52 247h120v-99h49l50-42h119" fill="none" stroke="#18694f" strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="52" cy="247" r="9" fill="#fff" stroke="#18694f" strokeWidth="4" />
          <circle cx="390" cy="106" r="13" fill="#d9ef6d" stroke="#18694f" strokeWidth="3" />
          <circle cx="390" cy="106" r="4" fill="#18694f" />
        </svg>
        <p className="welcome-page__caption"><span /> 自由选点 · 步行规划 · 情绪反馈</p>
      </section>
      <section className="welcome-page__planner" aria-label="规划步行路线">
        <div className="welcome-page__planner-heading"><span className="welcome-page__step">01</span><h2>今天，想走到哪里？</h2></div>
        <p className="welcome-page__instructions">在地图上自由选择梁溪区地图范围内的位置，或使用下方常用地点。</p>

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

        {selectionHint && <p className="welcome-page__validation" id="trip-selection-hint" role="status">{selectionHint}</p>}
        <button
          className="welcome-page__cta"
          disabled={!canGo}
          aria-describedby={selectionHint ? "trip-selection-hint" : undefined}
          onClick={handleGo}
          type="button"
        >
          查看路线
        </button>
        <p className="welcome-page__footnote">每一条反馈，都是了解这座城市的一小步。</p>
      </section>
      </main>
    </div>
  );
}
