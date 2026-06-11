package com.example.commutemood.domain;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Commute mood tag used for heatmap aggregation")
public enum EmotionTag {
    NOISE,
    CROWD,
    SUN,
    ODOR,
    OTHER
}
