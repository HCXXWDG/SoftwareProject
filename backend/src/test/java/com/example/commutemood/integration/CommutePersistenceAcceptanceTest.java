package com.example.commutemood.integration;

import com.example.commutemood.CommuteMoodApplication;
import com.example.commutemood.application.DeviceIdentityService;
import com.example.commutemood.config.DemoGeography;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.ScoredRoute;
import com.example.commutemood.repository.RouteQueryRepository;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;


/**
 * D06 数据库验收：并发幂等与归属校验（成员 D）。
 *
 * <p>与 {@link DatabaseMigrationAcceptanceTest} 分工：那边用裸 Flyway + JdbcTemplate 验证
 * 「建库/升级」这类结构问题，这边起真实的 {@code postgres} profile Spring 上下文，
 * 走完整 HTTP 链路，验证在真实事务与真实数据库约束下的行为。
 *
 * <p>为什么必须落到真库上跑：D02 的幂等承诺是「同一 {@code (deviceHash, operationId)}
 * 至多写入一条」。单元测试里用 Mockito 断言 SQL 文本只能证明代码写了
 * {@code ON CONFLICT DO NOTHING}，证明不了 12 个请求同时打进来时数据库真的只留一条——
 * 那取决于 V4 的部分唯一索引是否真的建出来、事务隔离下败者能否正确回读到胜者的行。
 * 这两件事只有真库能回答。
 *
 * <p>覆盖四个场景：
 * <ul>
 *   <li>并发重放同一 {@code operationId}：恰好一个 201，其余 200 duplicate，库里一行，趋势只加一次；</li>
 *   <li>归属校验：别的设备拿同一个 {@code snapshotId} 完成通勤一律 404，且不泄露快照是否存在，也不落库；</li>
 *   <li>快照过期：把 {@code created_at} 改老之后返回 410，与 404「缺失」区分开；</li>
 *   <li>冲突与重复的区分：同 {@code operationId} 换 {@code routeId} 是 409 conflict，不是 200 duplicate。</li>
 * </ul>
 *
 * <p>没有 Docker 且未指定 {@code COMMUTE_TEST_JDBC_URL} 时整类跳过；
 * 按 D06 口径这属于「未运行」，验收记录里不得记为通过。
 */
@SpringBootTest(classes = CommuteMoodApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
@EnabledIf("com.example.commutemood.integration.IntegrationDatabase#isAvailable")
class CommutePersistenceAcceptanceTest {

    /** 每个测试类一个一次性 schema，测试结束后整体丢弃，不碰开发者 public 里的真实数据。 */
    private static final String SCHEMA = IntegrationDatabase.newSchemaName("d06_app");

    private static final GeoPoint ORIGIN =
            new GeoPoint(DemoGeography.ORIGIN_LONGITUDE, DemoGeography.ORIGIN_LATITUDE);
    private static final GeoPoint DESTINATION =
            new GeoPoint(DemoGeography.DESTINATION_LONGITUDE, DemoGeography.DESTINATION_LATITUDE);

    private static final int CONCURRENCY = 12;

    @DynamicPropertySource
    static void registerDataSource(DynamicPropertyRegistry registry) {
        // 必须在上下文启动前建好 schema：currentSchema 指向不存在的 schema 时
        // PostgreSQL 不会自动创建，Flyway 建表会报 "no schema has been selected to create in"。
        IntegrationDatabase.createSchema(SCHEMA);
        registry.add("spring.datasource.url", () -> IntegrationDatabase.urlForSchema(SCHEMA));
        registry.add("spring.datasource.username", IntegrationDatabase::username);
        registry.add("spring.datasource.password", IntegrationDatabase::password);
        // 盐必须与 V2 种子里 ${deviceHashSalt} 使用的值一致，否则 demo-browser 的设备哈希对不上。
        registry.add("DEVICE_HASH_SALT", () -> IntegrationDatabase.DEVICE_HASH_SALT);
    }

    @AfterAll
    static void dropSchema() {
        IntegrationDatabase.dropSchemaQuietly(SCHEMA);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private RouteQueryRepository routeQueryRepository;

    @Autowired
    private DeviceIdentityService identityService;

    @Test
    void recordsOneCommuteWhenSameOperationIdArrivesConcurrently() throws Exception {
        String deviceId = "d06-concurrent-device";
        String deviceHash = identityService.hash(deviceId);
        UUID snapshotId = routeQueryRepository.save(deviceHash, ORIGIN, DESTINATION, comparison());
        String operationId = UUID.randomUUID().toString();

        int baseline = totalCommutes(deviceId);
        List<Integer> statuses = submitConcurrently(deviceId, snapshotId, operationId, "route-fast", 50);

        // 恰好一个创建成功，其余全部按「重复提交」返回既有结果，不允许出现 409 或 5xx。
        assertThat(statuses)
                .hasSize(CONCURRENCY)
                .allMatch(status -> status == 201 || status == 200);
        assertThat(statuses).filteredOn(status -> status == 201).hasSize(1);
        assertThat(statuses).filteredOn(status -> status == 200).hasSize(CONCURRENCY - 1);

        // 数据库里只有一行：幂等由 V4 的部分唯一索引兜底，不是靠应用层先查后插。
        assertThat(commuteRows(deviceHash, operationId)).isEqualTo(1);

        // 趋势只加一次：重放不会把一次通勤算成多次。
        assertThat(totalCommutes(deviceId)).isEqualTo(baseline + 1);

        // 历史接口同样只暴露一条。
        mockMvc.perform(get("/api/v1/commutes/history")
                        .header("X-Device-Id", deviceId)
                        .param("limit", "50")
                        .param("days", "30")
                        .param("timezone", "Asia/Shanghai"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].operationId").value(operationId));
    }

    @Test
    void hidesSnapshotFromOtherDevices() throws Exception {
        String ownerId = "d06-snapshot-owner";
        String intruderId = "d06-snapshot-intruder";
        UUID snapshotId = routeQueryRepository.save(
                identityService.hash(ownerId), ORIGIN, DESTINATION, comparison());

        // 别的设备拿同一个 snapshotId：404，而不是 403。
        // 统一成「不存在或不属于该设备」是刻意的——403 会泄露该快照确实存在。
        mockMvc.perform(complete(intruderId, snapshotId, UUID.randomUUID().toString(), "route-fast", 50))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("snapshot_not_found"));

        // 凭空捏造的 snapshotId 得到完全相同的响应，无法据此区分两种情况。
        mockMvc.perform(complete(intruderId, UUID.randomUUID(), UUID.randomUUID().toString(), "route-fast", 50))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("snapshot_not_found"));

        // 越权尝试没有留下任何通勤记录。
        assertThat(commuteRows(identityService.hash(intruderId), null)).isZero();

        // 越权设备也读不到别人的查询历史。
        mockMvc.perform(get("/api/v1/routes/history").header("X-Device-Id", intruderId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        // 归属正确的设备用同一个快照可以正常完成。
        mockMvc.perform(complete(ownerId, snapshotId, UUID.randomUUID().toString(), "route-fast", 50))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("created"))
                .andExpect(jsonPath("$.snapshotId").value(snapshotId.toString()));
    }

    @Test
    void reportsExpiredSnapshotAsGoneInsteadOfMissing() throws Exception {
        String deviceId = "d06-expired-device";
        UUID snapshotId = routeQueryRepository.save(
                identityService.hash(deviceId), ORIGIN, DESTINATION, comparison());

        // 快照上限是 30 分钟（CommuteService.SNAPSHOT_MAX_AGE），直接把 created_at 改老，
        // 不必真的等半小时。
        jdbcTemplate.update("UPDATE route_query SET created_at = now() - interval '2 hours' WHERE id = ?",
                snapshotId);

        mockMvc.perform(complete(deviceId, snapshotId, UUID.randomUUID().toString(), "route-fast", 50))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("snapshot_expired"));

        // 过期不等于写入：不能留下半条通勤。
        assertThat(commuteRows(identityService.hash(deviceId), null)).isZero();
    }

    @Test
    void distinguishesOperationIdConflictFromDuplicate() throws Exception {
        String deviceId = "d06-conflict-device";
        String deviceHash = identityService.hash(deviceId);
        UUID snapshotId = routeQueryRepository.save(deviceHash, ORIGIN, DESTINATION, comparison());
        String operationId = UUID.randomUUID().toString();

        MvcResult created = mockMvc
                .perform(complete(deviceId, snapshotId, operationId, "route-fast", 50))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("created"))
                .andReturn();
        String commuteId = readString(created, "$.commuteId");

        // 完全相同的重放：200 duplicate，并返回同一条通勤 ID。
        mockMvc.perform(complete(deviceId, snapshotId, operationId, "route-fast", 50))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("duplicate"))
                .andExpect(jsonPath("$.commuteId").value(commuteId));

        // 同一个操作 ID 换成别的路线：409 conflict，而不是静默覆盖或再插一条。
        mockMvc.perform(complete(deviceId, snapshotId, operationId, "route-calm", 25))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value("conflict"))
                .andExpect(jsonPath("$.existingCommuteId").value(commuteId));

        assertThat(commuteRows(deviceHash, operationId)).isEqualTo(1);
        assertThat(totalCommutes(deviceId)).isEqualTo(1);
    }

    /** 并发提交同一个操作 ID，返回每个请求的 HTTP 状态码（顺序不保证）。 */
    private List<Integer> submitConcurrently(
            String deviceId,
            UUID snapshotId,
            String operationId,
            String routeId,
            int endStressLevel
    ) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(CONCURRENCY);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = new ArrayList<>(CONCURRENCY);
            for (int index = 0; index < CONCURRENCY; index++) {
                futures.add(pool.submit(() -> {
                    // 所有线程在同一起跑线出发，尽量真的撞上同一个唯一索引。
                    start.await();
                    return mockMvc.perform(
                                    complete(deviceId, snapshotId, operationId, routeId, endStressLevel))
                            .andReturn()
                            .getResponse()
                            .getStatus();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>(CONCURRENCY);
            for (Future<Integer> future : futures) {
                statuses.add(future.get(60, TimeUnit.SECONDS));
            }
            return statuses;
        } finally {
            pool.shutdownNow();
        }
    }

    private MockHttpServletRequestBuilder complete(
            String deviceId,
            UUID snapshotId,
            String operationId,
            String routeId,
            int endStressLevel
    ) {
        String payload = """
                {"snapshotId":"%s","operationId":"%s","routeId":"%s","endStressLevel":%d}
                """.formatted(snapshotId, operationId, routeId, endStressLevel);
        return post("/api/v1/commutes/complete")
                .header("X-Device-Id", deviceId)
                .contentType("application/json")
                .content(payload);
    }

    private int totalCommutes(String deviceId) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/commutes/trends")
                        .header("X-Device-Id", deviceId)
                        .param("days", "30")
                        .param("timezone", "Asia/Shanghai"))
                .andExpect(status().isOk())
                .andReturn();
        return readInt(result, "$.totalCommutes");
    }

    /** {@code operationId} 为 null 时统计该设备的全部通勤。 */
    private int commuteRows(String deviceHash, String operationId) {
        Integer rows = operationId == null
                ? jdbcTemplate.queryForObject(
                        "SELECT count(*) FROM commute_record WHERE device_hash = ?",
                        Integer.class, deviceHash)
                : jdbcTemplate.queryForObject(
                        "SELECT count(*) FROM commute_record WHERE device_hash = ? AND operation_id = ?",
                        Integer.class, deviceHash, operationId);
        return rows == null ? 0 : rows;
    }

    private int readInt(MvcResult result, String path) throws Exception {
        Object value = JsonPath.read(body(result), path);
        return value == null ? 0 : ((Number) value).intValue();
    }

    private String readString(MvcResult result, String path) throws Exception {
        Object value = JsonPath.read(body(result), path);
        return value == null ? null : value.toString();
    }

    private String body(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    /** 与 ApiSmokeTest 保持一致的双路线比较结果，评分与预计时长都写在快照里。 */
    private RouteComparison comparison() {
        ScoredRoute fast = new ScoredRoute(
                "route-fast", "最快路线 A", 1500, 1080, 40.0, 62.0, 0.72, true, false, List.of());
        ScoredRoute calm = new ScoredRoute(
                "route-calm", "少心累路线 B", 1700, 1210, 20.0, 43.0, 0.68, false, true, List.of());
        return new RouteComparison(List.of(fast, calm), "route-fast", "route-calm", "ok", true);
    }
}
