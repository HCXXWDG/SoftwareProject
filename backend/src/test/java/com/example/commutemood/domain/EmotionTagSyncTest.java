package com.example.commutemood.domain;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 守住 D03 的验收点“新旧标签可读取、迁移无编号冲突”：
 * Java 枚举与数据库 CHECK 约束必须完全一致，任何一边单独新增标签都会让此测试失败。
 */
class EmotionTagSyncTest {

    private static final Pattern TAG_CHECK = Pattern.compile("tag IN \\(([^)]*)\\)", Pattern.CASE_INSENSITIVE);
    private static final Pattern QUOTED = Pattern.compile("'([^']+)'");
    /** 匹配 CASE 分支里的标签字面量，例如 {@code WHEN 0 THEN 'QUIET'} 或 {@code ELSE 'OPEN'}。 */
    private static final Pattern TAG_CASE_BRANCH = Pattern.compile("(?:THEN|ELSE)\\s+'([A-Z_]+)'");

    @Test
    void latestMigrationAllowsExactlyTheEnumValues() throws IOException {
        Set<String> allowed = allowedTagsIn("db/migration/V5__report_source_scope_and_positive_tags.sql");
        Set<String> enumNames = Arrays.stream(EmotionTag.values())
                .map(Enum::name)
                .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);

        assertThat(allowed)
                .as("V5 迁移的 emotion_report.tag CHECK 列表必须与 EmotionTag 枚举一一对应")
                .containsExactlyInAnyOrderElementsOf(enumNames);
    }

    @Test
    void newTagsAreAddedByNewMigrationWithoutRewritingV1() throws IOException {
        String v1 = read("db/migration/V1__create_schema.sql");
        String v5 = read("db/migration/V5__report_source_scope_and_positive_tags.sql");

        // V1 保持原样：仍是五个旧标签，说明没有改写已执行迁移
        assertThat(allowedTags(v1, "V1__create_schema.sql"))
                .containsExactly("NOISE", "CROWD", "SUN", "ODOR", "OTHER");
        // V5 通过先删后加的方式扩展约束
        assertThat(v5).contains("DROP CONSTRAINT IF EXISTS emotion_report_tag_check");
        assertThat(v5).contains("ADD CONSTRAINT emotion_report_tag_check");
        assertThat(allowedTags(v5, "V5__report_source_scope_and_positive_tags.sql"))
                .contains("QUIET", "SHADE", "OPEN");
    }

    @Test
    void seedDataOnlyUsesAllowedTags() throws IOException {
        Set<String> allowed = allowedTagsIn("db/migration/V5__report_source_scope_and_positive_tags.sql");
        String v5 = read("db/migration/V5__report_source_scope_and_positive_tags.sql");

        // 只扫描 CASE ... THEN '标签' 的分支，避免把注释文本、interval 字面量误判成标签
        Matcher branch = TAG_CASE_BRANCH.matcher(v5);
        int branches = 0;
        while (branch.find()) {
            branches++;
            String literal = branch.group(1);
            assertThat(allowed)
                    .as("V5 种子里的标签 %s 必须在约束列表中", literal)
                    .contains(literal);
        }
        assertThat(branches)
                .as("V5 应包含正向标签的种子分支")
                .isGreaterThanOrEqualTo(3);
    }

    private Set<String> allowedTagsIn(String classpathResource) throws IOException {
        return allowedTags(read(classpathResource), classpathResource);
    }

    private Set<String> allowedTags(String sql, String origin) {
        Matcher matcher = TAG_CHECK.matcher(sql);
        String list = null;
        while (matcher.find()) {
            list = matcher.group(1);
        }
        assertThat(list).as("%s 中应存在 tag IN (...) 约束", origin).isNotNull();
        Matcher quoted = QUOTED.matcher(list);
        Set<String> tags = new LinkedHashSet<>();
        while (quoted.find()) {
            tags.add(quoted.group(1));
        }
        return tags;
    }

    private String read(String classpathResource) throws IOException {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(classpathResource)) {
            assertThat(in).as("classpath 资源 %s 应存在", classpathResource).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void enumCoversFrontendContractOrder() {
        List<String> names = Arrays.stream(EmotionTag.values()).map(Enum::name).toList();
        // 与 frontend/src/types/index.ts 的 EmotionTag 联合类型顺序一致（C03 已采用）
        assertThat(names).containsExactly("NOISE", "CROWD", "SUN", "ODOR", "QUIET", "SHADE", "OPEN", "OTHER");
    }
}
