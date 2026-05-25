package com.forgeci.worker.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Publishes log lines and status updates to Redis.
 * - Logs go to pub/sub channel "forgeci:logs:{executionId}" for live streaming
 * - Logs also persist to list "forgeci:logstore:{executionId}" for replay
 * - Status changes also update Postgres via orchestrator REST API
 */
@Service
public class LogPublisher {

    private static final Logger log = LoggerFactory.getLogger(LogPublisher.class);

    private final StringRedisTemplate redisTemplate;
    private final RestTemplate restTemplate;
    private final String orchestratorUrl;

    public LogPublisher(StringRedisTemplate redisTemplate,
                        @org.springframework.beans.factory.annotation.Value("${orchestrator.url:http://localhost:8082}") String orchestratorUrl) {
        this.redisTemplate = redisTemplate;
        this.restTemplate = new RestTemplate();
        this.orchestratorUrl = orchestratorUrl;
    }

    /**
     * Publish a log line — both to pub/sub (live), list (persistence), and container console.
     */
    public void publishLog(String executionId, String message) {
        // Print to standard container logs so we can see it in 'docker compose logs'
        log.info("[{}] {}", executionId, message);

        String channel = "forgeci:logs:" + executionId;
        String storeKey = "forgeci:logstore:" + executionId;

        redisTemplate.convertAndSend(channel, message);
        redisTemplate.opsForList().rightPush(storeKey, message);
    }

    /**
     * Publish a status update — to Redis pub/sub AND to orchestrator Postgres.
     */
    public void publishStatus(String executionId, String status) {
        String message = "__STATUS__:" + status;
        publishLog(executionId, message);

        // Also update Postgres via orchestrator API
        try {
            restTemplate.put(
                orchestratorUrl + "/api/v1/pipelines/" + executionId + "/status",
                Map.of("status", status)
            );
        } catch (Exception e) {
            log.warn("Failed to update status via orchestrator API: {}", e.getMessage());
        }

        log.info("Published status {} for execution {}", status, executionId);
    }
}
