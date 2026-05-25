package com.forgeci.orchestrator.repository;

import com.forgeci.orchestrator.model.PipelineExecution;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PipelineExecutionRepository extends JpaRepository<PipelineExecution, String> {
    List<PipelineExecution> findAllByOrderByCreatedAtDesc();
}
