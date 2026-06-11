UPDATE commute_record
SET route_label = '最快路线 A',
    alternative_label = '少心累路线 B'
WHERE route_id = 'route-fast';

UPDATE commute_record
SET route_label = '少心累路线 B',
    alternative_label = '少心累路线 B'
WHERE route_id = 'route-calm';

UPDATE route_query
SET result_json = '{
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
             {"longitude": 116.392, "latitude": 39.905},
             {"longitude": 116.405, "latitude": 39.912}
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
             {"longitude": 116.392, "latitude": 39.905},
             {"longitude": 116.399, "latitude": 39.914},
             {"longitude": 116.405, "latitude": 39.912}
           ]
         }
       ],
       "fastestRouteId": "route-fast",
       "leastStressfulRouteId": "route-calm",
       "recommendation": "明天试少心累路线 B，预计更从容。",
       "recommendAlternative": true
     }'::jsonb
WHERE result_json::text LIKE '%route-fast%';
