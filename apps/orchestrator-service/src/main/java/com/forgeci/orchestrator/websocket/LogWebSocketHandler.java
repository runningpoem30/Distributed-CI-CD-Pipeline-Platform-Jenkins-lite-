package com.forgeci.orchestrator.websocket;

import com.forgeci.orchestrator.service.PipelineService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket handler that subscribes to Redis pub/sub channels
 * and forwards real-time build logs to connected browser clients.
 *
 * URL pattern: ws://localhost:8082/ws/logs/{executionId}
 */
@Component
public class LogWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(LogWebSocketHandler.class);

    private final PipelineService pipelineService;
    // Track active listeners so we can unsubscribe on disconnect
    private final Map<String, MessageListener> activeListeners = new ConcurrentHashMap<>();

    public LogWebSocketHandler(PipelineService pipelineService) {
        this.pipelineService = pipelineService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String executionId = extractExecutionId(session);
        if (executionId == null) {
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        log.info("WebSocket connected for execution {}", executionId);

        // First, send any existing stored logs (for late joiners / reconnects)
        for (String storedLog : pipelineService.getStoredLogs(executionId)) {
            session.sendMessage(new TextMessage(storedLog));
        }

        // Then subscribe to live Redis pub/sub for new logs
        MessageListener listener = (Message message, byte[] pattern) -> {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(new String(message.getBody())));
                }
            } catch (IOException e) {
                log.error("Failed to send WebSocket message", e);
            }
        };

        activeListeners.put(session.getId(), listener);
        pipelineService.subscribeToLogs(executionId, listener);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String executionId = extractExecutionId(session);
        MessageListener listener = activeListeners.remove(session.getId());
        if (executionId != null && listener != null) {
            pipelineService.unsubscribeFromLogs(executionId, listener);
            log.info("WebSocket disconnected for execution {}", executionId);
        }
    }

    private String extractExecutionId(WebSocketSession session) {
        URI uri = session.getUri();
        if (uri == null) return null;
        String path = uri.getPath();
        // Path: /ws/logs/{executionId}
        String[] parts = path.split("/");
        if (parts.length >= 4) {
            return parts[3];
        }
        return null;
    }
}
