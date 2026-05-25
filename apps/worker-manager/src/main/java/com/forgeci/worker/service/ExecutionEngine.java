package com.forgeci.worker.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * The actual execution engine.
 * Clones repos, parses pipeline YAML, runs commands with ProcessBuilder,
 * and streams stdout/stderr in real time through LogPublisher → Redis → WebSocket.
 */
@Service
public class ExecutionEngine {

    private static final Logger log = LoggerFactory.getLogger(ExecutionEngine.class);

    private final LogPublisher logPublisher;

    public ExecutionEngine(LogPublisher logPublisher) {
        this.logPublisher = logPublisher;
    }

    /**
     * Execute a full pipeline: clone → parse YAML → run each stage → report result.
     */
    public boolean execute(String executionId, String repoUrl, String branch, String pipelineYaml, String accessToken) {
        Path workDir = null;
        long startTime = System.currentTimeMillis();

        try {
            logPublisher.publishStatus(executionId, "RUNNING");
            logPublisher.publishLog(executionId, "⚡ [ForgeCI] Pipeline execution started");
            logPublisher.publishLog(executionId, "⚡ [ForgeCI] Execution ID: " + executionId);
            logPublisher.publishLog(executionId, "");

            // 1. Create temporary working directory
            workDir = Files.createTempDirectory("forgeci-" + executionId);
            logPublisher.publishLog(executionId, "📁 [Workspace] Created workspace: " + workDir.getFileName());

            // 2. Clone repository
            logPublisher.publishLog(executionId, "");
            logPublisher.publishLog(executionId, "📥 [Git] Cloning repository: " + repoUrl);
            logPublisher.publishLog(executionId, "📥 [Git] Branch: " + branch);

            // Use token-authenticated URL for private repos
            String cloneUrl = repoUrl;
            if (accessToken != null && !accessToken.isBlank() && repoUrl.contains("github.com")) {
                cloneUrl = repoUrl.replace("https://github.com/", "https://oauth2:" + accessToken + "@github.com/");
                logPublisher.publishLog(executionId, "📥 [Git] Using authenticated clone (private repo support)");
            }

            boolean cloneSuccess = runCommand(
                executionId,
                workDir.getParent().toFile(),
                "git", "clone", "--branch", branch, "--single-branch", "--depth", "1", cloneUrl, workDir.toAbsolutePath().toString()
            );

            if (!cloneSuccess) {
                // Try without branch specification (default branch)
                logPublisher.publishLog(executionId, "📥 [Git] Retrying clone with default branch...");
                cloneSuccess = runCommand(
                    executionId,
                    workDir.getParent().toFile(),
                    "git", "clone", "--depth", "1", cloneUrl, workDir.toAbsolutePath().toString()
                );
            }

            if (!cloneSuccess) {
                logPublisher.publishLog(executionId, "❌ [Git] Failed to clone repository");
                logPublisher.publishStatus(executionId, "FAILED");
                return false;
            }

            logPublisher.publishLog(executionId, "✔ [Git] Clone completed successfully");

            // 3. Parse pipeline YAML
            logPublisher.publishLog(executionId, "");
            logPublisher.publishLog(executionId, "📋 [Parser] Parsing pipeline definition...");

            List<Map<String, Object>> stages = parsePipelineYaml(pipelineYaml);
            logPublisher.publishLog(executionId, "📋 [Parser] Found " + stages.size() + " stage(s)");

            // 4. Execute each stage
            int stageNum = 0;
            for (Map<String, Object> stage : stages) {
                stageNum++;
                String stageName = (String) stage.getOrDefault("name", "Stage " + stageNum);
                @SuppressWarnings("unchecked")
                List<String> commands = (List<String>) stage.getOrDefault("commands", Collections.emptyList());

                logPublisher.publishLog(executionId, "");
                logPublisher.publishLog(executionId, "── Stage " + stageNum + "/" + stages.size() + ": " + stageName + " " + "─".repeat(30));

                long stageStart = System.currentTimeMillis();

                for (String command : commands) {
                    logPublisher.publishLog(executionId, "$ " + command);

                    // Split the command for shell execution
                    boolean cmdSuccess = runShellCommand(executionId, workDir.toFile(), command);

                    if (!cmdSuccess) {
                        long stageDuration = System.currentTimeMillis() - stageStart;
                        logPublisher.publishLog(executionId, "❌ Stage " + stageName + " FAILED after " + (stageDuration / 1000.0) + "s");
                        logPublisher.publishLog(executionId, "");
                        logPublisher.publishLog(executionId, "❌ Pipeline FAILED at stage: " + stageName);

                        long totalDuration = System.currentTimeMillis() - startTime;
                        logPublisher.publishLog(executionId, "⏱ Total duration: " + (totalDuration / 1000.0) + "s");
                        logPublisher.publishStatus(executionId, "FAILED");
                        return false;
                    }
                }

                long stageDuration = System.currentTimeMillis() - stageStart;
                logPublisher.publishLog(executionId, "✔ Stage " + stageName + " completed in " + (stageDuration / 1000.0) + "s");
            }

            // 5. Success
            long totalDuration = System.currentTimeMillis() - startTime;
            logPublisher.publishLog(executionId, "");
            logPublisher.publishLog(executionId, "✅ Pipeline completed successfully");
            logPublisher.publishLog(executionId, "⏱ Total duration: " + (totalDuration / 1000.0) + "s");
            logPublisher.publishStatus(executionId, "SUCCESS");
            return true;

        } catch (Exception e) {
            log.error("Pipeline execution failed", e);
            logPublisher.publishLog(executionId, "❌ [Error] " + e.getMessage());
            logPublisher.publishStatus(executionId, "FAILED");
            return false;

        } finally {
            // Cleanup temp directory
            if (workDir != null) {
                try {
                    deleteRecursively(workDir);
                    log.info("Cleaned up workspace for {}", executionId);
                } catch (IOException e) {
                    log.warn("Failed to clean up workspace: {}", e.getMessage());
                }
            }
        }
    }

    /**
     * Run a command using shell (sh -c) so that pipes, redirects, etc. work.
     */
    private boolean runShellCommand(String executionId, File workDir, String command) {
        return runCommand(executionId, workDir, "sh", "-c", command);
    }

    /**
     * Run a command with ProcessBuilder and stream stdout/stderr to Redis in real time.
     */
    private boolean runCommand(String executionId, File workDir, String... command) {
        try {
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(workDir);
            pb.redirectErrorStream(true);  // Merge stderr into stdout
            pb.environment().put("CI", "true");
            pb.environment().put("FORGECI", "true");

            Process process = pb.start();

            // Stream output line by line
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    logPublisher.publishLog(executionId, line);
                }
            }

            boolean finished = process.waitFor(300, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                logPublisher.publishLog(executionId, "❌ Command timed out after 300s");
                return false;
            }

            return process.exitValue() == 0;

        } catch (Exception e) {
            logPublisher.publishLog(executionId, "❌ Command error: " + e.getMessage());
            return false;
        }
    }

    /**
     * Parse the pipeline YAML into a list of stages.
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parsePipelineYaml(String yamlContent) {
        if (yamlContent == null || yamlContent.isBlank()) {
            return Collections.emptyList();
        }
        try {
            Yaml yaml = new Yaml();
            Map<String, Object> doc = yaml.load(yamlContent);
            if (doc == null || !doc.containsKey("stages")) {
                return Collections.emptyList();
            }
            Object stagesObj = doc.get("stages");
            if (stagesObj instanceof List) {
                return (List<Map<String, Object>>) stagesObj;
            }
            return Collections.emptyList();
        } catch (Exception e) {
            log.error("Failed to parse pipeline YAML", e);
            return Collections.emptyList();
        }
    }

    /**
     * Recursively delete a directory.
     */
    private void deleteRecursively(Path path) throws IOException {
        if (Files.isDirectory(path)) {
            try (var entries = Files.list(path)) {
                for (Path entry : entries.toList()) {
                    deleteRecursively(entry);
                }
            }
        }
        Files.deleteIfExists(path);
    }
}
