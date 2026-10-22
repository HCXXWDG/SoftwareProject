package com.example.commutemood.integration;

import com.example.commutemood.application.CommuteRecordDeduplication;
import com.example.commutemood.domain.CommuteRecord;
import com.example.commutemood.domain.RouteSource;
import com.example.commutemood.repository.jdbc.JdbcCommuteRecordRepository;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * D06 数据库验收：全新建库与旧库迁移（成员 D）。
 *
 * <p>任务书 D06 要求「组织全新建库、旧库迁移、并发幂等与归属校验的集成测试」。
 * 本类覆盖前两项，后两项在 {@link CommutePersistenceAcceptanceTest} 里走真实 HTTP 链路。
 *
 * <p>三个场景各自的验收意图：
 * <ul>
 *   <li><strong>全新建库</strong>：空 schema 一次跑到 V6，六个版本全部成功、PostGIS 可用、
 *       V4 的幂等部分唯一索引与四个新列就位、V5 的正向标签约束生效、
 *       V6 把三个评分列放宽为可空并补上取值范围 CHECK。
 *       这是新同学clone 仓库后第一次起后端的真实路径。</li>
 *   <li><strong>旧库迁移</strong>：先只迁移到 V3 造出一个「升级前的老库」，写入一条只有
 *       V1 列的历史通勤，再迁移到 V6。要求历史行不丢、V4 新列全为 NULL、<strong>V1 原有
 *       的评分原值保留</strong>、仓储能把它读回成 {@code routeSource = UNKNOWN}，并且多条
 *       {@code operation_id IS NULL} 的历史行不会被 V4 的部分唯一索引误判为冲突。
 *       这是 V4/V5/V6「只新增不改写、只放宽不加严」承诺的实际验证。</li>
 *   <li><strong>重复迁移</strong>：已迁移到最新的库再跑一次必须是空操作，种子数据不翻倍。</li>
 *   <li><strong>重启</strong>：迁移并写入后换一条全新连接（模拟应用重启 / 连接池重建），
 *       数据仍在、Flyway validate 仍干净、再 migrate 仍是空操作。</li>
 * </ul>
 *
 * <p>不用 Spring 上下文，直接用 Flyway + JdbcTemplate，这样能在同一个测试里
 * 先停在 V3、再升到 V6——Spring Boot 的自动迁移做不到中途换 target。
 *
 * <p>没有 Docker 且未指定 {@code COMMUTE_TEST_JDBC_URL} 时整类跳过；
 * 按 D06 口径这属于「未运行」，验收记录里不得记为通过。
 */
@EnabledIf("com.example.commutemood.integration.IntegrationDatabase#isAvailable")
class DatabaseMigrationAcceptanceTest {

    private static final String LEGACY_DEVICE = "d06-legacy-device";

    private SingleConnectionDataSource dataSource;
    private JdbcTemplate jdbc;
    private String schema;

    @BeforeEach
    void createDisposableSchema() {
        schema = IntegrationDatabase.newSchemaName("d06_migrate");
        IntegrationDatabase.createSchema(schema);
        dataSource = new SingleConnectionDataSource(
                IntegrationDatabase.urlForSchema(schema),
                IntegrationDatabase.username(),
                IntegrationDatabase.password(),
                true);
        jdbc = new JdbcTemplate(dataSource);
    }

    @AfterEach
    void dropDisposableSchema() {
        if (dataSource != null) {
            dataSource.destroy();
        }
        IntegrationDatabase.dropSchemaQuietly(schema);
    }

    @Test
    void migratesFreshDatabaseThroughAllSixVersions() {
        MigrateResult result = flyway(null).migrate();

        assertThat(result.success).isTrue();
        assertThat(result.migrationsExecuted).isEqualTo(6);
        assertThat(appliedVersions()).containsExactly("1", "2", "3", "4", "5", "6");

        // PostGIS 真的可用，不只是扩展行存在：几何构造函数与版本函数都要能跑。
        assertThat(jdbc.queryForObject("SELECT PostGIS_Version()", String.class)).isNotBlank();
        assertThat(jdbc.queryForObject(
                "SELECT ST_SRID(ST_SetSRID(ST_MakePoint(120.2735, 31.4753), 4326))", Integer.class))
                .isEqualTo(4326);

        // V4：四个新列 + 幂等部分唯一索引。
        assertThat(columnsOf("commute_record"))
                .contains("operation_id", "snapshot_id", "route_source", "estimated_seconds");
        assertThat(jdbc.queryForObject("""
                        SELECT count(*) FROM pg_indexes
                        WHERE schemaname = ? AND indexname = 'uq_commute_device_operation'
                        """, Integer.class, schema))
                .isEqualTo(1);

        // V5：正向标签进入约束，非法标签仍被数据库拒绝。
        insertReport("QUIET");
        assertThatThrownBy(() -> insertReport("BOGUS_TAG"))
                .isInstanceOf(DataIntegrityViolationException.class);

        // V6：三个评分列放宽为可空——「没有可验证评分」的通勤要能落库。
        assertThat(nullableScoreColumns())
                .containsExactly("confidence", "fastest_score", "selected_score");
        insertUnscoredCommute("op-unscored", "route-walk");
        assertThat(count("SELECT count(*) FROM commute_record WHERE selected_score IS NULL"))
                .isEqualTo(1);

        // V6：可空不等于不设防——越界评分仍被 CHECK 拒绝，避免脏值（负分、超 100）落库。
        assertThatThrownBy(() -> insertNewCommute("op-out-of-range", "route-fast", 50, Instant.now(), 150.0))
                .isInstanceOf(DataIntegrityViolationException.class);

        // 演示种子已播种，且真实反馈为空——REAL_ONLY 口径下新库不会把演示数据当真实数据。
        assertThat(count("SELECT count(*) FROM emotion_report WHERE simulated")).isGreaterThan(0);
        assertThat(count("SELECT count(*) FROM emotion_report WHERE NOT simulated")).isEqualTo(1);
    }

    @Test
    void upgradesLegacyDatabaseWithoutLosingExistingRows() {
        // 1) 造一个升级前的老库：只到 V3。
        MigrateResult partial = flyway("3").migrate();
        assertThat(partial.migrationsExecuted).isEqualTo(3);
        assertThat(appliedVersions()).containsExactly("1", "2", "3");
        assertThat(columnsOf("commute_record"))
                .doesNotContain("operation_id", "snapshot_id", "route_source", "estimated_seconds");

        // 2) 老库里写入一条历史通勤（只有 V1 的列）。
        //    注意 V2/V3 会为 demo-browser 播种 7 条通勤，所以计数一律按本测试的设备限定。
        Instant legacyTime = Instant.now().minus(40, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
        insertLegacyCommute("route-fast", 50, legacyTime);
        assertThat(deviceCommuteCount()).isEqualTo(1);

        // 3) 升级到最新（V3 -> V6，共三个迁移）。
        MigrateResult upgrade = flyway(null).migrate();
        assertThat(upgrade.success).isTrue();
        assertThat(upgrade.migrationsExecuted).isEqualTo(3);
        assertThat(appliedVersions()).containsExactly("1", "2", "3", "4", "5", "6");

        // 4) 历史行原样保留：V4 新列全为 NULL（不是被填了默认值冒充新数据），
        //    而 V1 原有的评分保持原值——V6 只放宽 NOT NULL，不改写已有数据。
        Map<String, Object> row = jdbc.queryForMap("""
                SELECT operation_id, snapshot_id, route_source, estimated_seconds,
                       selected_score, fastest_score, confidence
                FROM commute_record WHERE device_hash = ?
                """, LEGACY_DEVICE);
        assertThat(row.get("operation_id")).isNull();
        assertThat(row.get("snapshot_id")).isNull();
        assertThat(row.get("route_source")).isNull();
        assertThat(row.get("estimated_seconds")).isNull();
        assertThat(((Number) row.get("selected_score")).doubleValue()).isEqualTo(62.0);
        assertThat(((Number) row.get("fastest_score")).doubleValue()).isEqualTo(62.0);
        assertThat(((Number) row.get("confidence")).doubleValue()).isEqualTo(0.72);

        // 4b) V6 的可空放宽对老库同样生效：升级后的库也能写入无评分通勤。
        assertThat(nullableScoreColumns())
                .containsExactly("confidence", "fastest_score", "selected_score");

        // 5) 仓储能把历史行读回成合法领域对象：来源按 UNKNOWN 处理，预计秒数缺失。
        //    D05 的口径是「非 REAL 即未知」，UNKNOWN 会照常计入统计但被显式标记。
        JdbcCommuteRecordRepository repository = new JdbcCommuteRecordRepository(jdbc);
        List<CommuteRecord> records = repository.findByDeviceSince(LEGACY_DEVICE, Instant.EPOCH);
        assertThat(records).hasSize(1);
        CommuteRecord legacy = records.get(0);
        assertThat(legacy.operationId()).isNull();
        assertThat(legacy.snapshotId()).isNull();
        assertThat(legacy.routeSource()).isEqualTo(RouteSource.UNKNOWN);
        assertThat(legacy.estimatedSeconds()).isNull();
        assertThat(legacy.endStressLevel()).isEqualTo(50);
        assertThat(legacy.routeId()).isEqualTo("route-fast");
        // 老行有评分，读回来必须还是原值，不能因为列变可空就被读成 null 或 0。
        assertThat(legacy.selectedScore()).isEqualTo(62.0);
        assertThat(legacy.confidence()).isEqualTo(0.72);

        // 6) 多条 operation_id 为 NULL 的历史行互不冲突（V4 用的是部分唯一索引）。
        insertLegacyCommute("route-calm", 25, legacyTime.plus(1, ChronoUnit.DAYS));
        assertThat(deviceCommuteCount()).isEqualTo(2);

        // 7) 但同一个 operation_id 的第二条会被数据库层直接拒绝——幂等不依赖应用层判断。
        insertNewCommute("op-duplicate", "route-fast", 50, Instant.now(), 62.0);
        assertThatThrownBy(() -> insertNewCommute("op-duplicate", "route-calm", 25, Instant.now(), 62.0))
                .isInstanceOf(DataIntegrityViolationException.class);

        // 8) 历史行没有幂等键，重放写入拦不住，由 D05 的读侧折叠兜底。
        insertLegacyCommute("route-fast", 50, legacyTime);
        List<CommuteRecord> all = repository.findByDeviceSince(LEGACY_DEVICE, Instant.EPOCH);
        assertThat(all).hasSize(4);
        assertThat(CommuteRecordDeduplication.deduplicate(all)).hasSize(3);
        assertThat(CommuteRecordDeduplication.duplicateCount(all)).isEqualTo(1);
    }

    @Test
    void keepsReappliedMigrationsIdempotent() {
        MigrateResult first = flyway(null).migrate();
        assertThat(first.migrationsExecuted).isEqualTo(6);
        int reportsBefore = count("SELECT count(*) FROM emotion_report");
        int cellsBefore = count("SELECT count(*) FROM emotion_cell");

        Flyway replay = flyway(null);
        assertThatCode(replay::validate).doesNotThrowAnyException();
        MigrateResult second = replay.migrate();

        assertThat(second.success).isTrue();
        assertThat(second.migrationsExecuted).isZero();
        // 种子不会因为重跑迁移而翻倍（V5 的 INSERT 没有配套 DELETE，一旦重跑就会重复播种）。
        assertThat(count("SELECT count(*) FROM emotion_report")).isEqualTo(reportsBefore);
        assertThat(count("SELECT count(*) FROM emotion_cell")).isEqualTo(cellsBefore);
        assertThat(appliedVersions()).containsExactly("1", "2", "3", "4", "5", "6");
    }

    /**
     * 重启验收：迁移并写入后，换一条全新连接 + 全新仓储（模拟应用重启 / 连接池重建），
     * 数据必须仍在、Flyway validate 仍干净、再 migrate 仍是空操作。
     *
     * <p>这一条针对的是「升级只在当次进程里生效、重启后 schema 或数据回退」这类隐患：
     * 迁移结果落在数据库里而不是进程内存里，所以新连接看到的就是升级后的状态。
     */
    @Test
    void keepsDataAndSchemaValidAcrossSimulatedRestart() {
        flyway(null).migrate();
        insertUnscoredCommute("op-before-restart", "route-walk");
        insertNewCommute("op-scored-before-restart", "route-fast", 50, Instant.now(), 62.0);
        assertThat(deviceCommuteCount()).isEqualTo(2);

        // 模拟重启：丢弃旧连接，开一条全新连接与全新仓储。
        dataSource.destroy();
        dataSource = new SingleConnectionDataSource(
                IntegrationDatabase.urlForSchema(schema),
                IntegrationDatabase.username(),
                IntegrationDatabase.password(),
                true);
        jdbc = new JdbcTemplate(dataSource);
        JdbcCommuteRecordRepository repository = new JdbcCommuteRecordRepository(jdbc);

        assertThat(deviceCommuteCount()).isEqualTo(2);
        List<CommuteRecord> records = repository.findByDeviceSince(LEGACY_DEVICE, Instant.EPOCH);
        assertThat(records).hasSize(2);
        // 无评分的那条读回来评分为 null，有评分的那条仍是原值——重启不改变可空语义。
        assertThat(records).anySatisfy(record -> {
            assertThat(record.operationId()).isEqualTo("op-before-restart");
            assertThat(record.selectedScore()).isNull();
        });
        assertThat(records).anySatisfy(record -> {
            assertThat(record.operationId()).isEqualTo("op-scored-before-restart");
            assertThat(record.selectedScore()).isEqualTo(62.0);
        });

        // 重启后 Flyway 视角也一致：validate 干净、migrate 空操作。
        Flyway afterRestart = flyway(null);
        assertThatCode(afterRestart::validate).doesNotThrowAnyException();
        assertThat(afterRestart.migrate().migrationsExecuted).isZero();
    }

    private Flyway flyway(String target) {
        FluentConfiguration configuration = Flyway.configure()
                .dataSource(IntegrationDatabase.urlForSchema(schema),
                        IntegrationDatabase.username(),
                        IntegrationDatabase.password())
                .locations("classpath:db/migration")
                // V2 用 ${deviceHashSalt} 计算 demo-browser 的设备哈希，缺占位符会直接报错。
                .placeholders(Map.of("deviceHashSalt", IntegrationDatabase.DEVICE_HASH_SALT));
        if (target != null) {
            configuration.target(target);
        }
        // 不调用 schemas(...)：让 Flyway 沿用连接上 currentSchema 设好的 search_path，
        // 否则 PostGIS 的 geometry 类型（在 public 下）会解析不到。
        return configuration.load();
    }

    private List<String> appliedVersions() {
        return jdbc.queryForList("""
                SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank
                """, String.class);
    }

    private List<String> columnsOf(String table) {
        return jdbc.queryForList("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = ? AND table_name = ?
                ORDER BY ordinal_position
                """, String.class, schema, table);
    }

    private int count(String sql) {
        Integer value = jdbc.queryForObject(sql, Integer.class);
        return value == null ? 0 : value;
    }

    /**
     * 本测试设备名下的通勤条数。
     *
     * <p>必须按设备限定：V2/V3 迁移会为 {@code demo-browser} 播种 7 条通勤，
     * 直接 {@code count(*)} 会把种子数据算进来。
     */
    private int deviceCommuteCount() {
        Integer value = jdbc.queryForObject(
                "SELECT count(*) FROM commute_record WHERE device_hash = ?", Integer.class, LEGACY_DEVICE);
        return value == null ? 0 : value;
    }

    private void insertReport(String tag) {
        jdbc.update("""
                INSERT INTO emotion_report (device_hash, stress_level, tag, location, reported_at, simulated)
                VALUES (?, 0, ?, ST_SetSRID(ST_MakePoint(120.2735, 31.4753), 4326), now(), FALSE)
                """, "d06-migration-device", tag);
    }

    private void insertLegacyCommute(String routeId, int stressLevel, Instant completedAt) {
        jdbc.update("""
                INSERT INTO commute_record
                    (device_hash, route_id, route_label, end_stress_level, duration_minutes,
                     selected_score, fastest_score, confidence, completed_at)
                VALUES (?, ?, ?, ?, 20, 62.0, 62.0, 0.72, ?)
                """, LEGACY_DEVICE, routeId, "路线 " + routeId, stressLevel, Timestamp.from(completedAt));
    }

    private void insertNewCommute(String operationId, String routeId, int stressLevel,
                                  Instant completedAt, double selectedScore) {
        jdbc.update("""
                INSERT INTO commute_record
                    (device_hash, operation_id, route_id, route_label, route_source, end_stress_level,
                     duration_minutes, estimated_seconds, selected_score, fastest_score, confidence, completed_at)
                VALUES (?, ?, ?, ?, 'REAL', ?, 20, 1200, ?, ?, 0.72, ?)
                """, LEGACY_DEVICE, operationId, routeId, "路线 " + routeId, stressLevel,
                selectedScore, selectedScore, Timestamp.from(completedAt));
    }

    /**
     * 写入一条「没有可验证评分」的通勤（D07 口径）：三个评分列留 NULL。
     * V6 之前这条 INSERT 会直接违反 NOT NULL 而失败。
     */
    private void insertUnscoredCommute(String operationId, String routeId) {
        jdbc.update("""
                INSERT INTO commute_record
                    (device_hash, operation_id, route_id, route_label, route_source, end_stress_level,
                     duration_minutes, estimated_seconds, selected_score, fastest_score, confidence, completed_at)
                VALUES (?, ?, ?, ?, 'REAL', 50, 20, 1200, NULL, NULL, NULL, now())
                """, LEGACY_DEVICE, operationId, routeId, "路线 " + routeId);
    }

    /**
     * 当前 schema 里三个评分列中「可空」的那些，按列名升序。
     * V6 之前应返回空列表，V6 之后应三个都在。
     */
    private List<String> nullableScoreColumns() {
        return jdbc.queryForList("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = ? AND table_name = 'commute_record'
                  AND column_name IN ('selected_score', 'fastest_score', 'confidence')
                  AND is_nullable = 'YES'
                ORDER BY column_name
                """, String.class, schema);
    }
}
