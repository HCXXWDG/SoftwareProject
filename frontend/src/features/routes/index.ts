/**
 * features/routes — 路线面板占位。
 * 业务代码由成员 C 在 feature/map-interaction 分支中实现。
 * 此处仅导出 Props 类型以保证 A 的页面可编译。
 */

export interface RoutePanelProps {
  routes?: unknown[];
  fastestRouteId?: string;
  leastStressfulRouteId?: string;
  onSelectRoute?: (routeId: string) => void;
}

// 成员 C 将在此实现"最快"与"少心累"双路线对比面板
