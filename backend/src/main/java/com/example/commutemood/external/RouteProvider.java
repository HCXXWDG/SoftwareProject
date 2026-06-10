package com.example.commutemood.external;

import com.example.commutemood.domain.GeoPoint;
import com.example.commutemood.domain.RouteCandidate;

import java.util.List;

public interface RouteProvider {
    List<RouteCandidate> findCandidates(GeoPoint origin, GeoPoint destination);
}

