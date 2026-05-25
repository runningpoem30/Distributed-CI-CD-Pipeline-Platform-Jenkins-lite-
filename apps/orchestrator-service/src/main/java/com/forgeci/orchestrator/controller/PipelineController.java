package com.forgeci.orchestrator.controller;

import com.forgeci.orchestrator.model.PipelineExecution;
import com.forgeci.orchestrator.service.PipelineService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/pipelines")
public class PipelineController {

    private final PipelineService pipelineService;

    public PipelineController(PipelineService pipelineService) {
        this.pipelineService = pipelineService;
    }

    /**
     * Trigger a new pipeline execution.
     * Frontend calls this with: { repoUrl, branch, pipelineYaml, triggeredBy }
     */
    @PostMapping("/run")
    public ResponseEntity<Map<String, Object>> runPipeline(@RequestBody Map<String, String> request) {
        String repoUrl = request.getOrDefault("repoUrl", "");
        String branch = request.getOrDefault("branch", "main");
        String pipelineYaml = request.getOrDefault("pipelineYaml", "");
        String triggeredBy = request.getOrDefault("triggeredBy", "anonymous");
        String accessToken = request.getOrDefault("accessToken", "");

        if (repoUrl.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "repoUrl is required"));
        }

        PipelineExecution execution = pipelineService.createExecution(repoUrl, branch, pipelineYaml, triggeredBy, accessToken);

        return ResponseEntity.ok(Map.of(
            "executionId", execution.getId(),
            "status", execution.getStatus().name(),
            "message", "Pipeline queued successfully"
        ));
    }

    /**
     * Get execution details by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getExecution(@PathVariable String id) {
        return pipelineService.getExecution(id)
            .map(exec -> ResponseEntity.ok(Map.of(
                "id", exec.getId(),
                "repoUrl", exec.getRepoUrl(),
                "branch", exec.getBranch(),
                "status", exec.getStatus().name(),
                "triggeredBy", exec.getTriggeredBy() != null ? exec.getTriggeredBy() : "",
                "durationMs", exec.getDurationMs() != null ? exec.getDurationMs() : 0,
                "createdAt", exec.getCreatedAt().toString()
            )))
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Get all executions (for history page).
     */
    @GetMapping
    public ResponseEntity<List<PipelineExecution>> getAllExecutions() {
        return ResponseEntity.ok(pipelineService.getAllExecutions());
    }

    /**
     * Get stored logs for a completed execution.
     */
    @GetMapping("/{id}/logs")
    public ResponseEntity<List<String>> getLogs(@PathVariable String id) {
        return ResponseEntity.ok(pipelineService.getStoredLogs(id));
    }

    /**
     * Update execution status (called internally by workers via status channel).
     */
    @PutMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable String id, @RequestBody Map<String, String> request) {
        String status = request.get("status");
        String durationMs = request.get("durationMs");
        pipelineService.updateExecutionStatus(id, status, durationMs != null ? Long.parseLong(durationMs) : null);
        return ResponseEntity.ok(Map.of("updated", true));
    }

    /**
     * Health check.
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of(
            "status", "UP",
            "service", "orchestrator-service"
        ));
    }
}
