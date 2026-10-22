package com.example.commutemood.repository;

import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 路线比较快照仓储（成员 D 主责，任务 D01）。
 *
 * <p>保存比较结果后返回一个查询标识（快照 ID），供后续"完成通勤"按标识回读服务端快照，
 * 而不是由客户端重新提交评分。读取必须携带设备标识做归属校验：别的设备拿不到该快照。
 *
 * <p>有效期判断由 {@link #isExpired} 提供；调用方（D02 通勤服务）据此区分
 * "快照缺失"与"快照已过期"两种错误，并引导前端重新查询。
 *
 * <p>memory（demo）与 jdbc（postgres）两种实现的业务语义必须一致：
 * 保存返回 ID、按 ID+设备读取、归属校验、过期判断、按设备倒序取最近记录。
 * 持久化差异：memory 的快照在服务重启后清空（即"demo 重启后失效"），jdbc 的快照持久保存。
 */
public interface RouteQueryRepository {

    /**
     * 保存一次路线比较快照。
     *
     * @return 新建快照的查询标识；保存失败时抛出异常，不返回可用标识。
     */
    UUID save(String deviceHash, GeoPoint origin, GeoPoint destination, RouteComparison comparison);

    /**
     * 按快照 ID 和设备标识读取快照（归属校验）。
     *
     * <p>当快照不存在、或存在但属于其他设备时返回 {@link Optional#empty()}，
     * 调用方不得据此猜测内容。是否过期由 {@link #isExpired} 另行判断，
     * 以便区分"缺失"与"过期"。
     */
    Optional<RouteQueryHistory> findSnapshotById(UUID id, String deviceHash);

    List<RouteQueryHistory> findRecent(String deviceHash, int limit);

    /**
     * 判断快照是否已超过最大有效期。纯逻辑，两种实现共用。
     */
    default boolean isExpired(RouteQueryHistory snapshot, Instant now, Duration maxAge) {
        return snapshot.createdAt().isBefore(now.minus(maxAge));
    }
}
