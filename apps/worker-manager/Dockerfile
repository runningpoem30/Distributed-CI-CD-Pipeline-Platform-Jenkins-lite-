FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app

# Copy entire project (Docker context is repo root)
COPY pom.xml .
COPY libs libs
COPY apps apps

RUN apk add --no-cache maven && \
    mvn -pl libs/shared-dto,apps/worker-manager package -q -DskipTests -am -also-make

FROM eclipse-temurin:21-jdk-alpine
WORKDIR /app
# Worker needs git, bash, maven, nodejs, and npm to execute pipeline stages
RUN apk add --no-cache git bash maven nodejs npm
COPY --from=build /app/apps/worker-manager/target/*.jar app.jar
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "app.jar"]
