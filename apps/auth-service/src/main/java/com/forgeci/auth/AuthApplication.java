package com.forgeci.auth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@SpringBootApplication
@RestController
public class AuthApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuthApplication.class, args);
    }
    
    @GetMapping("/api/v1/auth/health")
    public Map<String, Object> health() {
        return Map.of(
            "status", "UP",
            "service", "auth-service",
            "message", "Auth Service is running successfully."
        );
    }
}
