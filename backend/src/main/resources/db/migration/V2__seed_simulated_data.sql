WITH clusters(cluster_index, base_longitude, base_latitude, mean_stress, spread) AS (
    VALUES
        (0, 116.3993, 39.9086, 78, 0.0012),
        (1, 116.3998, 39.9121, 24, 0.0014),
        (2, 116.4045, 39.9114, 72, 0.0008),
        (3, 116.3938, 39.9062, 32, 0.0010),
        (4, 116.3990, 39.9049, 55, 0.0013)
),
generated_reports AS (
    SELECT
        report_index,
        'simulated-device-' || report_index AS device_hash,
        base_longitude + ((((report_index * 37) % 200) - 100) / 100.0) * spread AS longitude,
        base_latitude + ((((report_index * 53) % 200) - 100) / 100.0) * spread AS latitude,
        CASE
            WHEN mean_stress + (((report_index * 29) % 31) - 15) <= 12 THEN 0
            WHEN mean_stress + (((report_index * 29) % 31) - 15) <= 37 THEN 25
            WHEN mean_stress + (((report_index * 29) % 31) - 15) <= 62 THEN 50
            WHEN mean_stress + (((report_index * 29) % 31) - 15) <= 87 THEN 75
            ELSE 100
        END AS stress_level,
        CASE report_index % 5
            WHEN 0 THEN 'NOISE'
            WHEN 1 THEN 'CROWD'
            WHEN 2 THEN 'SUN'
            WHEN 3 THEN 'ODOR'
            ELSE 'OTHER'
        END AS tag,
        now() - (((report_index * 17) % 168) * interval '1 hour') AS reported_at
    FROM generate_series(0, 499) AS series(report_index)
    JOIN clusters ON clusters.cluster_index = report_index % 5
)
INSERT INTO device_profile(device_hash, first_seen_at, last_seen_at)
SELECT device_hash, min(reported_at), max(reported_at)
FROM generated_reports
GROUP BY device_hash
ON CONFLICT (device_hash)
DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;

WITH clusters(cluster_index, base_longitude, base_latitude, mean_stress, spread) AS (
    VALUES
        (0, 116.3993, 39.9086, 78, 0.0012),
        (1, 116.3998, 39.9121, 24, 0.0014),
        (2, 116.4045, 39.9114, 72, 0.0008),
        (3, 116.3938, 39.9062, 32, 0.0010),
        (4, 116.3990, 39.9049, 55, 0.0013)
),
generated_reports AS (
    SELECT
        report_index,
        'simulated-device-' || report_index AS device_hash,
        base_longitude + ((((report_index * 37) % 200) - 100) / 100.0) * spread AS longitude,
        base_latitude + ((((report_index * 53) % 200) - 100) / 100.0) * spread AS latitude,
        CASE
            WHEN mean_stress + (((report_index * 29) % 31) - 15) <= 12 THEN 0
            WHEN mean_stress + (((report_index * 29) % 31) - 15) <= 37 THEN 25
            WHEN mean_stress + (((report_index * 29) % 31) - 15) <= 62 THEN 50
            WHEN mean_stress + (((report_index * 29) % 31) - 15) <= 87 THEN 75
            ELSE 100
        END AS stress_level,
        CASE report_index % 5
            WHEN 0 THEN 'NOISE'
            WHEN 1 THEN 'CROWD'
            WHEN 2 THEN 'SUN'
            WHEN 3 THEN 'ODOR'
            ELSE 'OTHER'
        END AS tag,
        now() - (((report_index * 17) % 168) * interval '1 hour') AS reported_at
    FROM generate_series(0, 499) AS series(report_index)
    JOIN clusters ON clusters.cluster_index = report_index % 5
)
INSERT INTO emotion_report(device_hash, stress_level, tag, location, reported_at, simulated)
SELECT
    device_hash,
    stress_level,
    tag,
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
    reported_at,
    TRUE
FROM generated_reports;

WITH demo_device AS (
    SELECT encode(digest('${deviceHashSalt}:demo-browser', 'sha256'), 'hex') AS device_hash
)
INSERT INTO device_profile(device_hash)
SELECT device_hash
FROM demo_device
ON CONFLICT (device_hash)
DO UPDATE SET last_seen_at = now();

WITH demo_device AS (
    SELECT encode(digest('${deviceHashSalt}:demo-browser', 'sha256'), 'hex') AS device_hash
),
stress_history(day_index, end_stress_level) AS (
    VALUES
        (0, 75),
        (1, 50),
        (2, 75),
        (3, 50),
        (4, 25),
        (5, 50),
        (6, 25)
)
INSERT INTO commute_record(
    device_hash,
    route_id,
    route_label,
    end_stress_level,
    duration_minutes,
    selected_score,
    fastest_score,
    alternative_label,
    alternative_score,
    alternative_duration_ratio,
    confidence,
    completed_at
)
SELECT
    demo_device.device_hash,
    CASE WHEN day_index % 2 = 0 THEN 'route-fast' ELSE 'route-calm' END,
    CASE WHEN day_index % 2 = 0 THEN 'Fastest Route A' ELSE 'Calmer Route B' END,
    end_stress_level,
    18 + day_index,
    CASE WHEN day_index % 2 = 0 THEN 62 ELSE 43 END,
    62,
    'Calmer Route B',
    43.0,
    1.12,
    0.72,
    now() - ((6 - day_index) * interval '1 day')
FROM stress_history
CROSS JOIN demo_device;

WITH demo_device AS (
    SELECT encode(digest('${deviceHashSalt}:demo-browser', 'sha256'), 'hex') AS device_hash
)
INSERT INTO route_query(device_hash, origin, destination, result_json)
SELECT
    device_hash,
    ST_SetSRID(ST_MakePoint(116.392, 39.905), 4326),
    ST_SetSRID(ST_MakePoint(116.405, 39.912), 4326),
    '{
       "routes": [
         {
           "id": "route-fast",
           "label": "Fastest Route A",
           "distanceMeters": 1200,
           "durationSeconds": 1080,
           "stressExposure": 62.0,
           "stressScore": 62.0,
           "confidence": 0.72,
           "fastest": true,
           "leastStressful": false,
           "polyline": [
             {"longitude": 116.392, "latitude": 39.905},
             {"longitude": 116.405, "latitude": 39.912}
           ]
         },
         {
           "id": "route-calm",
           "label": "Calmer Route B",
           "distanceMeters": 1360,
           "durationSeconds": 1260,
           "stressExposure": 43.0,
           "stressScore": 43.0,
           "confidence": 0.72,
           "fastest": false,
           "leastStressful": true,
           "polyline": [
             {"longitude": 116.392, "latitude": 39.905},
             {"longitude": 116.399, "latitude": 39.914},
             {"longitude": 116.405, "latitude": 39.912}
           ]
         }
       ],
       "fastestRouteId": "route-fast",
       "leastStressfulRouteId": "route-calm",
       "recommendation": "Try Calmer Route B tomorrow: expected stress score drops by 19 points.",
       "recommendAlternative": true
     }'::jsonb
FROM demo_device;
