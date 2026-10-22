import { useEffect, useState } from "react";
import { isCommuteRecordingEnabled, tripCapabilities } from "../../config/capabilities";
import { useCommuteOperation } from "../../hooks/useCommuteOperation";
import type { BackendStatus, BaseMapMode, CommuteCompleteRequest, CommuteCompletion, RouteComparison } from "../../types";
import "./CommuteCompletionPanel.css";

const levels = [0, 25, 50, 75, 100] as const;
const labels = { 0: "非常轻松", 25: "比较轻松", 50: "一般", 75: "有些心累", 100: "非常心累" };
interface Props {
  comparison: RouteComparison | null;
  selectedRouteId?: string;
  backend: BackendStatus;
  baseMap: BaseMapMode;
  active: boolean;
  contextKey: string;
  onSaved: (receipt: CommuteCompletion) => Promise<void>;
  onNewTrip: () => void;
}

/** Mounted across navigation so an uncertain write stays reachable without a fresh comparison. */
export function CommuteCompletionPanel(props: Props) {
  const enabled = isCommuteRecordingEnabled();
  const operation = useCommuteOperation({ enabled, contextKey: props.contextKey, onSaved: props.onSaved });
  const [stress, setStress] = useState<CommuteCompleteRequest["endStressLevel"] | null>(null);
  const refreshing = operation.refreshingQueries;
  useEffect(() => { setStress(null); }, [props.contextKey]);
  const capabilities = tripCapabilities(props.comparison, props.backend, props.baseMap, enabled);
  const route = props.comparison?.routes.find(candidate => candidate.id === props.selectedRouteId);
  const submitting = operation.phase === "submitting";
  const pending = operation.operation && !operation.receipt;

  if (!props.active && !operation.operation && operation.phase !== "blocked") return null;

  return <section className="commute-completion app-status" aria-label="通勤记录">
    <h2>记录本次通勤</h2>
    {operation.receipt ? <>
      <p role="status">{operation.receipt.status === "duplicate" ? "这次通勤已记录，无需重复提交。" : "通勤已记录。"}</p>
      <p>{operation.receipt.routeLabel} · 到达感受：{labels[operation.receipt.endStressLevel]}</p>
      <p>{operation.receipt.selectedScore === null ? "暂无路线评分" : `路线综合评分：${Math.round(operation.receipt.selectedScore)}`}</p>
      {operation.receipt.routeSource === "DEMO" && <p>这是演示通勤，不会计入真实趋势或通勤历史。</p>}
      {operation.receipt.routeSource === "UNKNOWN" && <p>路线来源待确认，不能视为真实路线评分。</p>}
      {props.active && <button type="button" disabled={refreshing} onClick={() => {
        void operation.refresh();
      }}>{refreshing ? "刷新中…" : "刷新趋势与历史"}</button>}
      <button type="button" disabled={refreshing || submitting} onClick={() => {
        if (operation.startNew()) { setStress(null); props.onNewTrip(); }
      }}>开始下一次通勤</button>
    </> : pending ? <>
      <p role="status">{submitting ? "正在确认通勤，请稍候…" : "上次通勤结果待确认，请重试同一次操作。"}</p>
      <p>已保留到达感受：{labels[operation.operation!.request.endStressLevel]}，重试不会修改原提交。</p>
      <button type="button" disabled={!enabled || submitting}
        onClick={() => { void operation.retry(); }}>{submitting ? "提交中…" : "重试原通勤"}</button>
    </> : <>
      <p id="commute-disabled-reason">{capabilities.completeReason}</p>
      {enabled && <fieldset disabled={submitting || !props.active}>
        <legend>本次通勤结束后的压力感受</legend>
        <div className="commute-completion__levels">{levels.map(level => <button type="button" key={level}
          aria-pressed={stress === level} onClick={() => setStress(level)}>{level} · {labels[level]}</button>)}</div>
      </fieldset>}
      <button type="button" aria-describedby="commute-disabled-reason" disabled={!props.active || !capabilities.canComplete || !route || stress === null || submitting}
        onClick={() => {
          if (route && props.comparison?.snapshotId && stress !== null) {
            void operation.begin({ snapshotId: props.comparison.snapshotId, routeId: route.id, endStressLevel: stress });
          }
        }}>完成本次通勤</button>
    </>}
    {!enabled && pending && <p>当前服务尚未开放通勤记录，恢复信息已保留。</p>}
    {operation.error && <p role="alert">{operation.error}</p>}
    {operation.refreshWarning && <p role="status">{operation.refreshWarning}</p>}
    {operation.storageWarning && <p role="status">{operation.storageWarning}</p>}
  </section>;
}
