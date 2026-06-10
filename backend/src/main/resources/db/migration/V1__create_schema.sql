CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE device_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_hash VARCHAR(64) NOT NULL UNIQUE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emotion_report (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_hash VARCHAR(64) NOT NULL,
    stress_level SMALLINT NOT NULL CHECK (stress_level IN (0, 25, 50, 75, 100)),
    tag VARCHAR(16) NOT NULL CHECK (tag IN ('NOISE', 'CROWD', 'SUN', 'ODOR', 'OTHER')),
    location geometry(Point, 4326) NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    simulated BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_emotion_report_location ON emotion_report USING GIST (location);
CREATE INDEX idx_emotion_report_reported_at ON emotion_report (reported_at DESC);
CREATE INDEX idx_emotion_report_device_time ON emotion_report (device_hash, reported_at DESC);

CREATE TABLE emotion_cell (
    cell_id VARCHAR(80) PRIMARY KEY,
    zoom_level SMALLINT NOT NULL,
    center geometry(Point, 4326) NOT NULL,
    score NUMERIC(5,2) NOT NULL,
    confidence NUMERIC(5,4) NOT NULL,
    sample_count INTEGER NOT NULL,
    dominant_tag VARCHAR(16) NOT NULL,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_emotion_cell_center ON emotion_cell USING GIST (center);

CREATE TABLE route_query (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_hash VARCHAR(64) NOT NULL,
    origin geometry(Point, 4326) NOT NULL,
    destination geometry(Point, 4326) NOT NULL,
    result_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_route_query_device_time ON route_query (device_hash, created_at DESC);

CREATE TABLE commute_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_hash VARCHAR(64) NOT NULL,
    route_id VARCHAR(80) NOT NULL,
    route_label VARCHAR(120) NOT NULL,
    end_stress_level SMALLINT NOT NULL CHECK (end_stress_level IN (0, 25, 50, 75, 100)),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    selected_score NUMERIC(5,2) NOT NULL,
    fastest_score NUMERIC(5,2) NOT NULL,
    alternative_label VARCHAR(120),
    alternative_score NUMERIC(5,2),
    alternative_duration_ratio NUMERIC(6,3),
    confidence NUMERIC(5,4) NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_commute_record_device_time ON commute_record (device_hash, completed_at DESC);

