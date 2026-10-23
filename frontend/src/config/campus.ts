/** @deprecated Import serviceArea for production; legacy source compatibility only. */
export { PRODUCT_NAME, WAYPOINTS, DEFAULT_ORIGIN, DEFAULT_DESTINATION, findWaypoint,
  SERVICE_AREA as CAMPUS, SERVICE_DEFAULT_BBOX as CAMPUS_DEFAULT_BBOX,
  SERVICE_VIEWPORT_CONSTRAINT as CAMPUS_VIEWPORT_CONSTRAINT } from './serviceArea';
export type { Waypoint, ViewportConstraint } from './serviceArea';