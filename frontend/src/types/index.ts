/** 情绪标签 */
export type EmotionTag = "NOISE" | "CROWD" | "SUN" | "ODOR" | "OTHER";

/** 地理坐标 */
export interface GeoPoint {
  longitude: number;
  latitude: number;
}

/** 热力图单元格 */
export interface HeatmapCell {
  cellId: string;
  center: GeoPoint;
  score: number;
  confidence: number;
  count: number;
  dominantTag: EmotionTag;
}

/** 打分路线 */
export interface ScoredRoute {
  id: string;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  stressExposure: number;
  stressScore: number;
  confidence: number;
  fastest: boolean;
  leastStressful: boolean;
  polyline: GeoPoint[];
}

/** 路线对比结果 */
export interface RouteComparison {
  routes: ScoredRoute[];
  fastestRouteId: string;
  leastStressfulRouteId: string;
  recommendation: string;
  recommendAlternative: boolean;
}

/** 通勤记录 */
export interface CommuteRecord {
  id: string;
  deviceHash: string;
  routeId: string;
  routeLabel: string;
  endStressLevel: number;
  durationMinutes: number;
  selectedScore: number;
  fastestScore: number;
  alternativeLabel: string | null;
  alternativeScore: number | null;
  alternativeDurationRatio: number | null;
  confidence: number;
  completedAt: string;
}

/** 趋势数据点 */
export interface TrendPoint {
  date: string;
  averageStress: number | null;
  commuteCount: number;
}

/** 趋势摘要 */
export interface TrendSummary {
  averageStress: number | null;
  stressDelta: number | null;
  direction: "improving" | "worsening" | "stable" | "unknown";
  sampleSufficient: boolean;
}

/** 趋势结果 */
export interface TrendResult {
  points: TrendPoint[];
  recommendation: string;
  totalCommutes: number;
  summary: TrendSummary;
}

/** 提交通勤反馈 */
export interface CommuteCompleteRequest {
  routeId: string;
  routeLabel: string;
  endStressLevel: number;
  durationMinutes: number;
  selectedScore: number;
  fastestScore: number;
  alternativeLabel?: string;
  alternativeScore?: number;
  alternativeDurationRatio?: number;
  confidence: number;
  completedAt?: string;
}

/** 提交情绪报告 */
export interface ReportRequest {
  location: GeoPoint;
  stressLevel: number;
  tag: EmotionTag;
  reportedAt?: string;
}

/** 路线对比请求 */
export interface RouteCompareRequest {
  origin: GeoPoint;
  destination: GeoPoint;
}

/** 地图页面状态，通过 Props 传入 */
export interface MapPageState {
  heatmapCells: HeatmapCell[];
  loading: boolean;
  error: string | null;
  routeComparison: RouteComparison | null;
  trend: TrendResult | null;
  selectedOrigin: GeoPoint | null;
  selectedDestination: GeoPoint | null;
}
