import { useState, type ReactNode } from "react";
import { MapPage } from "./pages/MapPage";
import type { MapPageState } from "./types";

const initialMapState: MapPageState = {
  heatmapCells: [],
  loading: false,
  error: null,
  routeComparison: null,
  trend: null,
  selectedOrigin: null,
  selectedDestination: null,
};

function App() {
  const [mapState] = useState<MapPageState>(initialMapState);

  // mapSlot 由成员 C 在后续分支中注入高德地图 ReactNode
  const mapSlot: ReactNode = null;

  return <MapPage state={mapState} mapSlot={mapSlot ?? undefined} />;
}

export default App;
