FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app
COPY pom.xml .
COPY libs libs
COPY apps/orchestrator-service apps/orchestrator-service
RUN apk add --no-cache maven && \
    mvn -pl libs/shared-dto install -q -DskipTests && \
    mvn -pl apps/orchestrator-service package -q -DskipTests -am

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/apps/orchestrator-service/target/*.jar app.jar
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "app.jar"]
