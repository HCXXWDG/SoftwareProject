-- Migrate demo seed to Jiangnan University Lihu campus (GCJ-02).
-- Safe for databases that already applied V2.

DELETE FROM emotion_report WHERE simulated = TRUE;
DELETE FROM emotion_cell;

WITH clusters(cluster_index, base_longitude, base_latitude, mean_stress, spread) AS (
    VALUES
        (0, 120.2740, 31.4830, 78, 0.0012),
        (1, 120.2680, 31.4810, 24, 0.0014),
        (2, 120.2750, 31.4790, 72, 0.0008),
        (3, 120.2730, 31.4760, 32, 0.0010),
        (4, 120.2760, 31.4820, 55, 0.0013)
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
        (0, 120.2740, 31.4830, 78, 0.0012),
        (1, 120.2680, 31.4810, 24, 0.0014),
        (2, 120.2750, 31.4790, 72, 0.0008),
        (3, 120.2730, 31.4760, 32, 0.0010),
        (4, 120.2760, 31.4820, 55, 0.0013)
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

UPDATE commute_record
SET route_label = '最快路线 A',
    alternative_label = '少心累路线 B'
WHERE route_id = 'route-fast';

UPDATE commute_record
SET route_label = '少心累路线 B',
    alternative_label = '少心累路线 B'
WHERE route_id = 'route-calm';

UPDATE route_query
SET origin = ST_SetSRID(ST_MakePoint(120.2735103, 31.4753281), 4326),
    destination = ST_SetSRID(ST_MakePoint(120.2743195, 31.4832753), 4326),
    result_json = '{
       "routes": [
         {
           "id": "route-fast",
           "label": "最快路线 A",
           "distanceMeters": 1200,
           "durationSeconds": 1080,
           "stressExposure": 62.0,
           "stressScore": 62.0,
           "confidence": 0.72,
           "fastest": true,
           "leastStressful": false,
           "polyline": [
             {"longitude": 120.2735103, "latitude": 31.4753281},
             {"longitude": 120.2743195, "latitude": 31.4832753}
           ]
         },
         {
           "id": "route-calm",
           "label": "少心累路线 B",
           "distanceMeters": 1360,
           "durationSeconds": 1260,
           "stressExposure": 43.0,
           "stressScore": 43.0,
           "confidence": 0.72,
           "fastest": false,
           "leastStressful": true,
           "polyline": [
             {"longitude": 120.2735103, "latitude": 31.4753281},
             {"longitude": 120.2680, "latitude": 31.4810},
             {"longitude": 120.2743195, "latitude": 31.4832753}
           ]
         }
       ],
       "fastestRouteId": "route-fast",
       "leastStressfulRouteId": "route-calm",
       "recommendation": "Try 少心累路线 B tomorrow: expected stress score drops by 19 points.",
       "recommendAlternative": true
     }'::jsonb;
