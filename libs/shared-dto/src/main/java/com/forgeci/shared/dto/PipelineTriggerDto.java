package com.forgeci.shared.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PipelineTriggerDto implements Serializable {
    private static final long serialVersionUID = 1L;
    
    private String pipelineId;
    private String commitSha;
    private String branch;
    private String triggeredBy;
}
