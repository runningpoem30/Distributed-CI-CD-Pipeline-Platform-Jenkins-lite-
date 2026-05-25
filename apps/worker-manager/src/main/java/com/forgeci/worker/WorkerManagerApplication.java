package com.forgeci.worker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(exclude = {
    org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration.class
})
public class WorkerManagerApplication {
    public static void main(String[] args) {
        SpringApplication.run(WorkerManagerApplication.class, args);
    }
}
