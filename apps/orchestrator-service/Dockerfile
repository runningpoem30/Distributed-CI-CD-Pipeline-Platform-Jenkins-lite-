FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app

# Copy entire project (Docker context is repo root)
COPY pom.xml .
COPY libs libs
COPY apps apps

RUN apk add --no-cache maven && \
    mvn -pl libs/shared-dto,apps/orchestrator-service package -q -DskipTests -am -also-make

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/apps/orchestrator-service/target/*.jar app.jar
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "app.jar"]
