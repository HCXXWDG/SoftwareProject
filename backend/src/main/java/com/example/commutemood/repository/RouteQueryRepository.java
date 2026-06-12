package com.example.commutemood.repository;

import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteComparison;
import com.example.commutemood.domain.RouteQueryHistory;

import java.util.List;

public interface RouteQueryRepository {
    void save(String deviceHash, GeoPoint origin, GeoPoint destination, RouteComparison comparison);

    List<RouteQueryHistory> findRecent(String deviceHash, int limit);
}
