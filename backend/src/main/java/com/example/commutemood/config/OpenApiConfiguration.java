package com.example.commutemood.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfiguration {
    @Bean
    public OpenAPI commuteMoodOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Commute Mood API")
                        .version("0.1.0")
                        .description("Backend API for commute mood reports, heatmaps, routes and trends."))
                .servers(List.of(new Server()
                        .url("http://localhost:8080")
                        .description("Local development server")));
    }
}
