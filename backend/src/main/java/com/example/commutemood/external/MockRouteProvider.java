package com.example.commutemood.external;

import com.example.commutemood.application.GeoMath;
import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteCandidate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class MockRouteProvider implements RouteProvider {

    private static final Logger log = LoggerFactory.getLogger(MockRouteProvider.class);

    /** 每条路线生成的路径点数量 */
    private static final int PATH_POINTS = 16;

    @Override
    public List<RouteCandidate> findCandidates(GeoPoint origin, GeoPoint destination) {
        double dx = destination.longitude() - origin.longitude();
        double dy = destination.latitude() - origin.latitude();
        double distance = GeoMath.distanceMeters(origin, destination);
        double bearing = Math.atan2(dx, dy);

        // 垂直于行进方向的单位向量
        double perpLng = Math.cos(bearing);
        double perpLat = -Math.sin(bearing);

        log.info("MockRouteProvider generating 3 routes: origin=({},{}) dest=({},{}) distance={}m",
                origin.longitude(), origin.latitude(),
                destination.longitude(), destination.latitude(), Math.round(distance));

        // 路线1：较快路线 — 小幅波动
        List<GeoPoint> fastest = generateCurvedPath(origin, dx, dy, perpLng, perpLat, distance,
                2.0,    // 波动频率
                0.00012, // 波动幅度
                0.92);   // 距离系数

        // 路线2：少心累路线 — 中幅波动，绕开主路
        List<GeoPoint> calmer = generateCurvedPath(origin, dx, dy, perpLng, perpLat, distance,
                2.8,
                0.00022,
                1.08);

        // 路线3：风景路线 — 大幅波动，偏绕行
        List<GeoPoint> scenic = generateCurvedPath(origin, dx, dy, perpLng, perpLat, distance,
                3.2,
                0.00030,
                1.18);

        int fastDist = (int) polylineDistance(fastest);
        int calmDist = (int) polylineDistance(calmer);
        int scenicDist = (int) polylineDistance(scenic);
        double walkSpeed = 1.35; // m/s — 休闲步行
        int fastDuration = Math.max(120, (int) (fastDist / walkSpeed));
        int calmDuration = Math.max(150, (int) (fastDuration * 1.12));
        int scenicDuration = Math.max(180, (int) (fastDuration * 1.28));

        return List.of(
                new RouteCandidate("route-fast", "最快路线 A", fastDist, fastDuration, fastest, 68.0),
                new RouteCandidate("route-calm", "少心累路线 B", calmDist, calmDuration, calmer, 28.0),
                new RouteCandidate("route-scenic", "风景路线 C", scenicDist, scenicDuration, scenic, null));
    }

    /**
     * 生成一条从 origin 到 destination 的弯曲路径。
     * @param frequency  正弦波频率，越大弯曲越多
     * @param amplitude 横向偏移幅度（经纬度单位，0.0001≈街区宽度，0.0003≈绕过一栋楼）
     * @param ratio     距离系数，>1 表示绕行更远
     */
    private List<GeoPoint> generateCurvedPath(
            GeoPoint origin,
            double dx, double dy,
            double perpLng, double perpLat,
            double distance,
            double frequency, double amplitude, double ratio) {

        List<GeoPoint> points = new ArrayList<>(PATH_POINTS);
        double steps = PATH_POINTS - 1;

        for (int i = 0; i < PATH_POINTS; i++) {
            double t = i / steps;
            // 正弦波动，两端平滑归零
            double wave = Math.sin(t * Math.PI * frequency) * (1.0 - t) * t * 4.0;
            // 路径长度调整（提前少量打弯再回归）
            double along = t + Math.sin(t * Math.PI * 1.5) * t * (1.0 - t) * 0.06 * (ratio - 1.0);

            double lng = origin.longitude() + dx * along + perpLng * wave * amplitude * distance;
            double lat = origin.latitude() + dy * along + perpLat * wave * amplitude * distance;

            points.add(new GeoPoint(
                    Math.round(lng * 10_000_000.0) / 10_000_000.0,
                    Math.round(lat * 10_000_000.0) / 10_000_000.0));
        }
        return points;
    }

    private double polylineDistance(List<GeoPoint> points) {
        double result = 0;
        for (int index = 1; index < points.size(); index++) {
            result += GeoMath.distanceMeters(points.get(index - 1), points.get(index));
        }
        return result;
    }
}
