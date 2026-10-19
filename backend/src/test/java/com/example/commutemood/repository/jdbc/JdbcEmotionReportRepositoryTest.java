package com.example.commutemood.repository.jdbc;

import com.example.commutemood.domain.EmotionReport;
import com.example.commutemood.domain.EmotionTag;
import com.example.commutemood.domain.GeoBounds;
import com.example.commutemood.repository.ReportScope;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcEmotionReportRepositoryTest {

    private static final GeoBounds BOUNDS = new GeoBounds(120.260, 31.470, 120.280, 31.490);
    private static final Instant SINCE = Instant.parse("2026-10-12T00:00:00Z");

    @Test
    @SuppressWarnings("unchecked")
    void realOnlyScopeAppendsSimulatedFalsePredicate() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.query(any(String.class), any(RowMapper.class), any(), any(), any(), any(), any()))
                .thenReturn(List.of());
        JdbcEmotionReportRepository repository = new JdbcEmotionReportRepository(jdbcTemplate);

        repository.findWithin(BOUNDS, SINCE, ReportScope.REAL_ONLY);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class),
                eq(Timestamp.from(SINCE)),
                eq(BOUNDS.west()), eq(BOUNDS.south()), eq(BOUNDS.east()), eq(BOUNDS.north()));
        assertThat(sql.getValue()).contains("AND simulated = FALSE");
    }

    @Test
    @SuppressWarnings("unchecked")
    void simulatedOnlyScopeAppendsSimulatedTruePredicate() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.query(any(String.class), any(RowMapper.class), any(), any(), any(), any(), any()))
                .thenReturn(List.of());
        JdbcEmotionReportRepository repository = new JdbcEmotionReportRepository(jdbcTemplate);

        repository.findWithin(BOUNDS, SINCE, ReportScope.SIMULATED_ONLY);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), any(), any(), any(), any(), any());
        assertThat(sql.getValue()).contains("AND simulated = TRUE");
    }

    @Test
    @SuppressWarnings("unchecked")
    void allScopeLeavesQueryUnfilteredSoDemoSeedStillShows() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.query(any(String.class), any(RowMapper.class), any(), any(), any(), any(), any()))
                .thenReturn(List.of());
        JdbcEmotionReportRepository repository = new JdbcEmotionReportRepository(jdbcTemplate);

        repository.findWithin(BOUNDS, SINCE, ReportScope.ALL);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), any(), any(), any(), any(), any());
        assertThat(sql.getValue()).doesNotContain("simulated =");
    }

    @Test
    @SuppressWarnings("unchecked")
    void legacyTwoArgumentQueryUsesAllScope() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.query(any(String.class), any(RowMapper.class), any(), any(), any(), any(), any()))
                .thenReturn(List.of());
        JdbcEmotionReportRepository repository = new JdbcEmotionReportRepository(jdbcTemplate);

        repository.findWithin(BOUNDS, SINCE);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), any(), any(), any(), any(), any());
        assertThat(sql.getValue()).doesNotContain("simulated =");
    }

    @Test
    @SuppressWarnings("unchecked")
    void rowMapperReadsNewPositiveTagsAndFallsBackForUnknownLegacyValues() throws Exception {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        ArgumentCaptor<RowMapper<EmotionReport>> mapper = ArgumentCaptor.forClass(RowMapper.class);
        when(jdbcTemplate.query(any(String.class), mapper.capture(), any(), any(), any(), any(), any()))
                .thenReturn(List.of());
        JdbcEmotionReportRepository repository = new JdbcEmotionReportRepository(jdbcTemplate);

        repository.findWithin(BOUNDS, SINCE, ReportScope.REAL_ONLY);

        UUID id = UUID.randomUUID();
        Instant reportedAt = Instant.parse("2026-10-18T08:30:00Z");
        RowMapper<EmotionReport> rowMapper = mapper.getValue();

        EmotionReport shade = rowMapper.mapRow(resultSet(id, "SHADE", false, reportedAt), 0);
        assertThat(shade.tag()).isEqualTo(EmotionTag.SHADE);
        assertThat(shade.simulated()).isFalse();
        assertThat(shade.reportedAt()).isEqualTo(reportedAt);
        assertThat(shade.location().longitude()).isEqualTo(120.2700);
        assertThat(shade.location().latitude()).isEqualTo(31.4800);

        EmotionReport unknown = rowMapper.mapRow(resultSet(id, "LEGACY_TAG", true, reportedAt), 1);
        assertThat(unknown.tag()).isEqualTo(EmotionTag.OTHER);
        assertThat(unknown.simulated()).isTrue();
    }

    private ResultSet resultSet(UUID id, String tag, boolean simulated, Instant reportedAt) throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getObject("id", UUID.class)).thenReturn(id);
        when(rs.getString("device_hash")).thenReturn("device-hash");
        when(rs.getDouble("longitude")).thenReturn(120.2700);
        when(rs.getDouble("latitude")).thenReturn(31.4800);
        when(rs.getInt("stress_level")).thenReturn(25);
        when(rs.getString("tag")).thenReturn(tag);
        when(rs.getTimestamp("reported_at")).thenReturn(Timestamp.from(reportedAt));
        when(rs.getBoolean("simulated")).thenReturn(simulated);
        return rs;
    }
}
