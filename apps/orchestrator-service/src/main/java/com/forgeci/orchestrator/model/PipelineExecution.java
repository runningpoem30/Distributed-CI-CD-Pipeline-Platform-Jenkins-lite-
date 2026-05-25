package com.forgeci.orchestrator.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "pipeline_executions")
public class PipelineExecution {

    @Id
    private String id;

    @Column(nullable = false)
    private String repoUrl;

    @Column(nullable = false)
    private String branch;

    @Column(columnDefinition = "TEXT")
    private String pipelineYaml;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ExecutionStatus status;

    private String triggeredBy;

    private Long durationMs;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    public PipelineExecution() {}

    public PipelineExecution(String id, String repoUrl, String branch, String pipelineYaml, String triggeredBy) {
        this.id = id;
        this.repoUrl = repoUrl;
        this.branch = branch;
        this.pipelineYaml = pipelineYaml;
        this.triggeredBy = triggeredBy;
        this.status = ExecutionStatus.PENDING;
        this.createdAt = LocalDateTime.now();
    }

    // Getters and setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getRepoUrl() { return repoUrl; }
    public void setRepoUrl(String repoUrl) { this.repoUrl = repoUrl; }

    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }

    public String getPipelineYaml() { return pipelineYaml; }
    public void setPipelineYaml(String pipelineYaml) { this.pipelineYaml = pipelineYaml; }

    public ExecutionStatus getStatus() { return status; }
    public void setStatus(ExecutionStatus status) {
        this.status = status;
        this.updatedAt = LocalDateTime.now();
    }

    public String getTriggeredBy() { return triggeredBy; }
    public void setTriggeredBy(String triggeredBy) { this.triggeredBy = triggeredBy; }

    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
