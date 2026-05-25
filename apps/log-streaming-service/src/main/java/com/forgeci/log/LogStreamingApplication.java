package com.forgeci.log;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.Map;

@SpringBootApplication
@RestController
public class LogStreamingApplication {
    public static void main(String[] args) {
        SpringApplication.run(LogStreamingApplication.class, args);
    }
    
    @GetMapping("/api/v1/stream/health")
    public Mono<Map<String, Object>> health() {
        return Mono.just(Map.of(
            "status", "UP",
            "service", "log-streaming-service",
            "reactive", true,
            "message", "Log Streamer is reactive and active."
        ));
    }
}
