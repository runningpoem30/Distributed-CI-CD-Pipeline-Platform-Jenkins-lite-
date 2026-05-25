FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app
COPY pom.xml .
COPY libs libs
COPY apps/worker-manager apps/worker-manager
RUN apk add --no-cache maven && \
    mvn -pl libs/shared-dto install -q -DskipTests && \
    mvn -pl apps/worker-manager package -q -DskipTests -am

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
# Worker needs git to clone repos
RUN apk add --no-cache git bash
COPY --from=build /app/apps/worker-manager/target/*.jar app.jar
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "app.jar"]
