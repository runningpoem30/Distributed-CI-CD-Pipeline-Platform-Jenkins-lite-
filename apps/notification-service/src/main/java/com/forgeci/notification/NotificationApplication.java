package com.forgeci.notification;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@SpringBootApplication
@RestController
public class NotificationApplication {
    public static void main(String[] args) {
        SpringApplication.run(NotificationApplication.class, args);
    }
    
    @GetMapping("/api/v1/notifications/health")
    public Map<String, Object> health() {
        return Map.of(
            "status", "UP",
            "service", "notification-service",
            "message", "Notification Service is standing by."
        );
    }
}
