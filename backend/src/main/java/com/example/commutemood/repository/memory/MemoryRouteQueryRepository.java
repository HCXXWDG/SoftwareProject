package com.example.commutemood.repository.memory;

import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;
import com.example.commutemood.repository.RouteQueryRepository;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
@Profile("!postgres")
public class MemoryRouteQueryRepository implements RouteQueryRepository {
    @Override
    public void save(String deviceHash, GeoPoint origin, GeoPoint destination, RouteComparison comparison) {
        // Demo mode intentionally keeps route-query history out of memory.
    }

    @Override
    public List<RouteQueryHistory> findRecent(String deviceHash, int limit) {
        return List.of();
    }
}
