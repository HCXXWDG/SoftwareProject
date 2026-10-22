package com.example.commutemood.integration;

import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * D06 数据库验收集成测试的统一取库入口（成员 D）。
 *
 * <p>为什么需要它：D06 要求「全新建库、旧库迁移、并发幂等、归属校验」四类集成测试，
 * 但团队成员的本地环境差别很大——CI（GitHub Actions ubuntu-latest）有 Docker，
 * 而部分成员本机没有 Docker 却装了真实的 PostgreSQL + PostGIS。只用 Testcontainers
 * 会让没 Docker 的人整类跳过，只用本地库又会让 CI 跑不起来。
 *
 * <p>因此这里的解析顺序是：
 * <ol>
 *   <li>显式指定的外部数据库（系统属性 {@code commute.test.jdbc.url}
 *       或环境变量 {@code COMMUTE_TEST_JDBC_URL}，配套
 *       {@code commute.test.jdbc.username} / {@code commute.test.jdbc.password}）；</li>
 *   <li>否则若本机有 Docker，则启动 {@code postgis/postgis:16-3.4} 容器；</li>
 *   <li>两者都没有时 {@link #isAvailable()} 返回 {@code false}，
 *       测试类通过 {@code @EnabledIf} 整体跳过。</li>
 * </ol>
 *
 * <p><strong>跳过不等于通过。</strong>按任务书 D06 的口径，环境缺失导致跳过的检查
 * 在验收记录里只能写「未运行」，不能写「通过」。
 *
 * <p><strong>隔离方式：schema，不是 database。</strong>项目约定的 {@code commute} 角色
 * 没有 CREATEDB 权限，无法为每次测试新建数据库；因此每个测试类使用一个独立的
 * 一次性 schema（见 {@link #newSchemaName}），通过 JDBC 的 {@code currentSchema}
 * 参数把它排在 {@code public} 之前。这样既能验证「从空库开始建表」，又不会碰到
 * {@code public} 里开发者自己的真实数据，测试结束后整个 schema 被丢弃。
 *
 * <p>{@code currentSchema} 必须带上 {@code public}：PostGIS 与 pgcrypto 扩展是
 * 数据库级对象，安装在 {@code public} 下，V1 里的 {@code geometry(Point, 4326)}
 * 与 V2 里的 {@code digest()} 需要能在 search_path 中找到它们。
 */
public final class IntegrationDatabase {

    /**
     * 与 {@code application-postgres.yml} 的默认盐保持一致。
     * V2 种子用 {@code ${deviceHashSalt}} 计算 {@code demo-browser} 的设备哈希，
     * 缺少该占位符时 Flyway 会直接报未解析占位符错误。
     */
    public static final String DEVICE_HASH_SALT = "local-demo-salt-change-before-deploy";

    public static final String DATABASE_NAME = "commute_mood";
    public static final String DEFAULT_USERNAME = "commute";
    public static final String DEFAULT_PASSWORD = "commute_dev_password";

    private static final DockerImageName POSTGIS_IMAGE =
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres");

    private static final AtomicInteger SEQUENCE = new AtomicInteger();

    private static boolean resolved;
    private static boolean available;
    private static String reason;
    private static String baseUrl;
    private static String username;
    private static String password;
    private static PostgreSQLContainer<?> container;

    private IntegrationDatabase() {
    }

    /**
     * 是否具备可运行的数据库环境。只做探测，不启动容器；供 {@code @EnabledIf} 使用。
     */
    public static synchronized boolean isAvailable() {
        resolve();
        return available;
    }

    /** 不可用时的原因，用于验收记录里写明「未运行」的具体依据。 */
    public static synchronized String unavailableReason() {
        resolve();
        return reason;
    }

    /** 一次性 schema 名，形如 {@code d06_fresh_1_k3j2h1}。 */
    public static String newSchemaName(String prefix) {
        String suffix = Long.toString(System.nanoTime(), 36);
        return (prefix + "_" + SEQUENCE.incrementAndGet() + "_" + suffix).toLowerCase(Locale.ROOT);
    }

    /** 基础连接串（不带 schema 限定），用于建/删 schema 这类跨 schema 操作。 */
    public static synchronized String baseUrl() {
        requireAvailable();
        return baseUrl;
    }

    /**
     * 把连接限定到指定 schema 的连接串。
     *
     * <p>{@code public} 放在后面，保证扩展里的类型与函数仍可解析，
     * 而应用表的解析优先命中测试专用 schema。
     */
    public static synchronized String urlForSchema(String schema) {
        requireAvailable();
        String separator = baseUrl.contains("?") ? "&" : "?";
        return baseUrl + separator + "currentSchema=" + schema + ",public";
    }

    public static synchronized String username() {
        requireAvailable();
        return username;
    }

    public static synchronized String password() {
        requireAvailable();
        return password;
    }

    /** 打开一个连接到基础库（search_path 为默认值）的连接，调用方负责关闭。 */
    public static Connection openBase() throws SQLException {
        return DriverManager.getConnection(baseUrl(), username(), password());
    }

    /** 打开一个限定到指定 schema 的连接，调用方负责关闭。 */
    public static Connection openSchema(String schema) throws SQLException {
        return DriverManager.getConnection(urlForSchema(schema), username(), password());
    }

    /**
     * 创建测试专用 schema。必须在 Spring 上下文启动前完成：
     * {@code currentSchema} 指向一个不存在的 schema 时，PostgreSQL 不会自动创建它，
     * 后续建表会报 "no schema has been selected to create in"。
     */
    public static void createSchema(String schema) {
        try (Connection connection = openBase(); Statement statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA IF NOT EXISTS " + quote(schema));
        } catch (SQLException exception) {
            throw new IllegalStateException("无法创建测试 schema " + schema, exception);
        }
    }

    /** 丢弃测试专用 schema 及其全部对象；失败只记录，不影响测试结论。 */
    public static void dropSchemaQuietly(String schema) {
        if (schema == null) {
            return;
        }
        try (Connection connection = openBase(); Statement statement = connection.createStatement()) {
            statement.execute("DROP SCHEMA IF EXISTS " + quote(schema) + " CASCADE");
        } catch (SQLException | IllegalStateException exception) {
            System.err.println("[IntegrationDatabase] 清理 schema " + schema + " 失败：" + exception.getMessage());
        }
    }

    private static String quote(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    private static void requireAvailable() {
        if (!available) {
            throw new IllegalStateException("数据库集成测试环境不可用：" + reason);
        }
    }

    private static void resolve() {
        if (resolved) {
            return;
        }
        resolved = true;
        String overrideUrl = firstNonBlank(
                System.getProperty("commute.test.jdbc.url"),
                System.getenv("COMMUTE_TEST_JDBC_URL"));
        if (overrideUrl != null) {
            baseUrl = overrideUrl;
            username = orDefault(firstNonBlank(
                    System.getProperty("commute.test.jdbc.username"),
                    System.getenv("COMMUTE_TEST_JDBC_USERNAME")), DEFAULT_USERNAME);
            password = orDefault(firstNonBlank(
                    System.getProperty("commute.test.jdbc.password"),
                    System.getenv("COMMUTE_TEST_JDBC_PASSWORD")), DEFAULT_PASSWORD);
            available = true;
            reason = null;
            return;
        }
        if (!DockerClientFactory.instance().isDockerAvailable()) {
            available = false;
            reason = "本机没有可用的 Docker，且未通过 commute.test.jdbc.url / COMMUTE_TEST_JDBC_URL "
                    + "指定外部 PostgreSQL；数据库验收集成测试未运行。";
            return;
        }
        container = new PostgreSQLContainer<>(POSTGIS_IMAGE)
                .withDatabaseName(DATABASE_NAME)
                .withUsername(DEFAULT_USERNAME)
                .withPassword(DEFAULT_PASSWORD);
        container.start();
        baseUrl = container.getJdbcUrl();
        username = container.getUsername();
        password = container.getPassword();
        available = true;
        reason = null;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private static String orDefault(String value, String fallback) {
        return value == null ? fallback : value;
    }
}
