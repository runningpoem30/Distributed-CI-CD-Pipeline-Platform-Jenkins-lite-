package com.forgeci.worker.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Continuously polls the Redis queue for pipeline jobs.
 * When a job is found, it hands off to ExecutionEngine for actual execution.
 *
 * Uses BRPOP (blocking pop) so it waits efficiently without busy-looping.
 */
@Service
public class QueueConsumerService {

    private static final Logger log = LoggerFactory.getLogger(QueueConsumerService.class);
    private static final String QUEUE_KEY = "forgeci:pipeline:queue";

    private final StringRedisTemplate redisTemplate;
    private final ExecutionEngine executionEngine;
    private final ObjectMapper objectMapper;
    private final ExecutorService executorPool;

    private volatile boolean running = true;
    private Thread pollerThread;

    public QueueConsumerService(StringRedisTemplate redisTemplate, ExecutionEngine executionEngine) {
        this.redisTemplate = redisTemplate;
        this.executionEngine = executionEngine;
        this.objectMapper = new ObjectMapper();
        // Thread pool for concurrent builds (max 4 parallel builds)
        this.executorPool = Executors.newFixedThreadPool(4);
    }

    @PostConstruct
    public void startPolling() {
        pollerThread = new Thread(this::pollLoop, "forgeci-queue-poller");
        pollerThread.setDaemon(true);
        pollerThread.start();
        log.info("ForgeCI Worker Manager started — polling Redis queue '{}'", QUEUE_KEY);
    }

    @PreDestroy
    public void stopPolling() {
        running = false;
        executorPool.shutdown();
        try {
            executorPool.awaitTermination(30, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (pollerThread != null) {
            pollerThread.interrupt();
        }
        log.info("ForgeCI Worker Manager stopped");
    }

    private void pollLoop() {
        while (running) {
            try {
                // BRPOP blocks for up to 5 seconds waiting for a job
                String jobPayload = redisTemplate.opsForList().rightPop(QUEUE_KEY, 5, TimeUnit.SECONDS);

                if (jobPayload != null) {
                    log.info("Received pipeline job from queue");
                    processJob(jobPayload);
                }
            } catch (Exception e) {
                if (running) {
                    log.error("Error polling queue", e);
                    try {
                        Thread.sleep(2000);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void processJob(String jobPayload) {
        try {
            Map<String, String> job = objectMapper.readValue(jobPayload, Map.class);

            String executionId = job.get("executionId");
            String repoUrl = job.get("repoUrl");
            String branch = job.getOrDefault("branch", "main");
            String pipelineYaml = job.getOrDefault("pipelineYaml", "");
            String accessToken = job.getOrDefault("accessToken", "");

            log.info("Processing pipeline job: {} for repo: {}", executionId, repoUrl);

            // Execute in thread pool so we can handle multiple builds concurrently
            executorPool.submit(() -> {
                try {
                    executionEngine.execute(executionId, repoUrl, branch, pipelineYaml, accessToken);
                } catch (Exception e) {
                    log.error("Execution failed for {}", executionId, e);
                }
            });

        } catch (Exception e) {
            log.error("Failed to parse job payload: {}", jobPayload, e);
        }
    }
}
