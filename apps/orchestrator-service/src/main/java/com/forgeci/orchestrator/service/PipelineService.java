package com.forgeci.orchestrator.service;

import com.forgeci.orchestrator.model.ExecutionStatus;
import com.forgeci.orchestrator.model.PipelineExecution;
import com.forgeci.orchestrator.repository.PipelineExecutionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class PipelineService {

    private static final Logger log = LoggerFactory.getLogger(PipelineService.class);
    private static final String QUEUE_KEY = "forgeci:pipeline:queue";

    private final PipelineExecutionRepository repository;
    private final StringRedisTemplate redisTemplate;
    private final RedisMessageListenerContainer listenerContainer;
    private final ObjectMapper objectMapper;

    public PipelineService(PipelineExecutionRepository repository,
                           StringRedisTemplate redisTemplate,
                           RedisMessageListenerContainer listenerContainer) {
        this.repository = repository;
        this.redisTemplate = redisTemplate;
        this.listenerContainer = listenerContainer;
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Create a pipeline execution, save to Postgres, push job to Redis queue.
     */
    public PipelineExecution createExecution(String repoUrl, String branch, String pipelineYaml, String triggeredBy, String accessToken) {
        String executionId = "exec_" + UUID.randomUUID().toString().substring(0, 8);

        PipelineExecution execution = new PipelineExecution(executionId, repoUrl, branch, pipelineYaml, triggeredBy);
        repository.save(execution);

        // Build job payload and push to Redis queue
        try {
            Map<String, String> job = new LinkedHashMap<>();
            job.put("executionId", executionId);
            job.put("repoUrl", repoUrl);
            job.put("branch", branch);
            job.put("pipelineYaml", pipelineYaml);
            if (accessToken != null && !accessToken.isBlank()) {
                job.put("accessToken", accessToken);
            }

            String jobPayload = objectMapper.writeValueAsString(job);
            redisTemplate.opsForList().leftPush(QUEUE_KEY, jobPayload);
            log.info("Queued pipeline job {} to Redis", executionId);
        } catch (Exception e) {
            log.error("Failed to queue pipeline job", e);
            execution.setStatus(ExecutionStatus.FAILED);
            repository.save(execution);
        }

        return execution;
    }

    /**
     * Get execution by ID.
     */
    public Optional<PipelineExecution> getExecution(String executionId) {
        return repository.findById(executionId);
    }

    /**
     * Get all executions ordered by creation time.
     */
    public List<PipelineExecution> getAllExecutions() {
        return repository.findAllByOrderByCreatedAtDesc();
    }

    /**
     * Subscribe a listener to the log channel for a specific execution.
     * Worker publishes logs to "forgeci:logs:{executionId}".
     */
    public void subscribeToLogs(String executionId, MessageListener listener) {
        ChannelTopic topic = new ChannelTopic("forgeci:logs:" + executionId);
        listenerContainer.addMessageListener(listener, topic);
        log.info("Subscribed to log channel for execution {}", executionId);
    }

    /**
     * Unsubscribe from log channel.
     */
    public void unsubscribeFromLogs(String executionId, MessageListener listener) {
        ChannelTopic topic = new ChannelTopic("forgeci:logs:" + executionId);
        listenerContainer.removeMessageListener(listener, topic);
        log.info("Unsubscribed from log channel for execution {}", executionId);
    }

    /**
     * Get stored logs for an execution (for replay / history).
     */
    public List<String> getStoredLogs(String executionId) {
        String key = "forgeci:logstore:" + executionId;
        List<String> logs = redisTemplate.opsForList().range(key, 0, -1);
        return logs != null ? logs : Collections.emptyList();
    }

    /**
     * Update execution status in Postgres (called when worker reports status changes).
     */
    public void updateExecutionStatus(String executionId, String status, Long durationMs) {
        repository.findById(executionId).ifPresent(exec -> {
            try {
                exec.setStatus(ExecutionStatus.valueOf(status));
                if (durationMs != null) {
                    exec.setDurationMs(durationMs);
                }
                repository.save(exec);
                log.info("Updated execution {} status to {}", executionId, status);
            } catch (Exception e) {
                log.error("Failed to update execution status", e);
            }
        });
    }
}
