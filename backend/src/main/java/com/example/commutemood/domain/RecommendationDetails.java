package com.example.commutemood.domain;

/** Estimated travel differences and algorithmic coverage, never a correctness probability. */
public record RecommendationDetails(int extraDurationSeconds, double durationRatio,
                                    Double environmentImprovement, Double compositeImprovement,
                                    double dataCoverage) { }
