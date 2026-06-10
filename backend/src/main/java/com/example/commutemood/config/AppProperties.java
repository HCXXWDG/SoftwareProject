package com.example.commutemood.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String deviceHashSalt,
        Amap amap,
        List<String> corsOrigins
) {
    public record Amap(String webKey) {
    }
}

