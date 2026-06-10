package com.example.commutemood.application;

import com.example.commutemood.domain.HeatmapCell;
import com.example.commutemood.domain.RouteCandidate;
import com.example.commutemood.domain.ScoredRoute;

import java.util.List;

public interface RouteScoringStrategy {
    ScoredRoute score(
            RouteCandidate route,
            int fastestDurationSeconds,
            List<HeatmapCell> cells,
            boolean fastest
    );
}

