package com.example.commutemood;

import com.example.commutemood.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class CommuteMoodApplication {
    public static void main(String[] args) {
        SpringApplication.run(CommuteMoodApplication.class, args);
    }
}

