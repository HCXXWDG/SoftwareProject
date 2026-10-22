package com.example.commutemood.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.IOException;
import java.util.List;

@Configuration
public class WebConfiguration implements WebMvcConfigurer {
    private static final Logger log = LoggerFactory.getLogger(WebConfiguration.class);
    private final AppProperties properties;

    public WebConfiguration(AppProperties properties) {
        this.properties = properties;
    }

    @Bean
    public FilterRegistrationBean<OncePerRequestFilter> corsFilter() {
        List<String> allowedOrigins = properties.corsOriginList();
        OncePerRequestFilter filter = new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(HttpServletRequest request,
                                            HttpServletResponse response,
                                            FilterChain filterChain) throws ServletException, IOException {
                String origin = request.getHeader("Origin");
                if (origin != null) {
                    boolean allowed = allowedOrigins.contains(origin)
                            || origin.startsWith("http://localhost")
                            || origin.startsWith("capacitor://localhost");
                    log.debug("CORS origin: {} allowed={}", origin, allowed);
                    if (allowed) {
                        response.setHeader("Access-Control-Allow-Origin", origin);
                        response.setHeader("Vary", "Origin");
                        response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                        response.setHeader("Access-Control-Allow-Headers", "*");
                        response.setHeader("Access-Control-Max-Age", "3600");
                        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
                            response.setStatus(HttpServletResponse.SC_OK);
                            return;
                        }
                    }
                }
                filterChain.doFilter(request, response);
            }
        };
        FilterRegistrationBean<OncePerRequestFilter> bean = new FilterRegistrationBean<>(filter);
        bean.setOrder(0);
        return bean;
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addRedirectViewController("/", "/swagger-ui.html");
    }
}
