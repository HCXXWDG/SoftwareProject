/**
 * features/map — 地图交互占位。
 * 业务代码由成员 C 在 feature/map-interaction 分支中实现。
 * 此处仅导出 Props 类型以保证 A 的页面可编译。
 */

export interface MapInteractionProps {
  onReport?: (location: { longitude: number; latitude: number }, stressLevel: number, tag: string) => void;
}

// 成员 C 将在此实现高德地图 JS API 2.0 的加载与交互
