/** 情绪标签 */
export type EmotionTag = "NOISE" | "CROWD" | "SUN" | "ODOR" | "QUIET" | "SHADE" | "OPEN" | "OTHER";

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
  /** 待 B/D 契约确认；旧接口缺少时保持未知。 */
  routeSource?: "REAL" | "DEMO" | "UNAVAILABLE";
  feedbackSource?: "REAL" | "DEMO" | "NONE";
  scoringStatus?: "VALID" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
  comparisonId?: string;
  recommendationReason?: string;
}

export type BackendStatus = "unknown" | "available" | "unavailable";
export type BaseMapMode = "loading" | "amap" | "offline";
export interface TripEndpoints { originId: string; destinationId: string; }

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
  /** D05: server estimates only; absent on older responses. */
  averageEstimatedSeconds?: number | null;
  estimatedSampleCount?: number;
}

export interface TrendSummary {
  averageStress: number | null;
  stressDelta: number | null;
  direction: "unknown" | "stable" | "improving" | "worsening";
  sampleSufficient: boolean;
}

/** 趋势结果 */
export interface TrendResult {
  points: TrendPoint[];
  recommendation: string;
  totalCommutes: number;
  summary?: TrendSummary;
  /** D05 metadata is optional while the original backend remains supported. */
  days?: number;
  timezone?: string;
  unknownSourceCommutes?: number;
  excludedDemoCommutes?: number;
  deduplicatedCommutes?: number;
  outOfWindowCommutes?: number;
}

/** D02 完成通勤：评分和预计时长仅由服务端快照重建。 */
export interface CommuteCompleteRequest {
  snapshotId: string;
  /** 同一次通勤重试必须复用；新通勤生成新值。 */
  operationId: string;
  routeId: string;
  endStressLevel: 0 | 25 | 50 | 75 | 100;
  completedAt?: string;
}

/** D02 成功响应；UNKNOWN 来源不可解释为真实评分。 */
export interface CommuteCompletion {
  status: "created" | "duplicate";
  commuteId: string;
  operationId: string;
  snapshotId: string;
  routeId: string;
  routeLabel: string;
  routeSource: "REAL" | "DEMO" | "UNKNOWN";
  estimatedSeconds: number;
  /** ceil(estimatedSeconds / 60)，不代表实测实际时长。 */
  durationMinutes: number;
  selectedScore: number;
  endStressLevel: 0 | 25 | 50 | 75 | 100;
  completedAt: string;
  message: string;
}

/** 相同 operationId 已被其他通勤内容占用，不能当作重复成功。 */
export interface CommuteCompletionConflict {
  status: "conflict";
  operationId: string;
  existingCommuteId?: string;
  existingSnapshotId?: string;
  existingRouteId?: string;
  message: string;
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

/** 地图反馈草稿（由 C 的地图组件生成，通过回调传给 A） */
export interface MapFeedbackDraft {
  location: GeoPoint;
  stressLevel: 0 | 25 | 50 | 75 | 100;
  tag: EmotionTag;
}

/** 地图页面状态，通过 Props 传入 */
export interface MapPageState {
  heatmapCells: HeatmapCell[];
  loading: boolean;
  error: string | null;
  routeComparison: RouteComparison | null;
  trend: TrendResult | null;
}

/** 应用三阶段状态 */
export type AppStage = "welcome" | "route-preview" | "map";

/** 路线预览页状态 */
export interface RoutePreviewState {
  loading: boolean;
  error: string | null;
  routeComparison: RouteComparison | null;
  /** 后端不可用时使用 Mock 路线数据（不伪造评分） */
  isOfflineFallback: boolean;
}
