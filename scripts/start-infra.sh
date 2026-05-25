#!/bin/bash
set -e

# Support Docker Desktop installations on macOS missing standard symlinks
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

echo "========================================================"
echo "Starting ForgeCI Core Infrastructure Containers..."
echo "========================================================"

cd "$(dirname "$0")/../infra/docker"
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml up -d

echo "--------------------------------------------------------"
echo "Waiting for services to become healthy..."
echo "--------------------------------------------------------"

# Wait for Postgres
until docker exec forgeci-postgres pg_isready -U forgeci -d forgeci >/dev/null 2>&1; do
  echo "Waiting for Postgres database..."
  sleep 1
done
echo "✔ PostgreSQL is healthy."

# Wait for Redis
until [ "$(docker exec forgeci-redis redis-cli -a forgeci ping 2>/dev/null | tr -d '\r')" = "PONG" ]; do
  echo "Waiting for Redis cluster connection..."
  sleep 1
done
echo "✔ Redis is healthy."

# Wait for Kafka
until docker exec forgeci-kafka nc -z localhost 9092 >/dev/null 2>&1; do
  echo "Waiting for Kafka KRaft broker..."
  sleep 1
done
echo "✔ Apache Kafka is healthy."

# Wait for MinIO
until curl -s http://localhost:9000/minio/health/live >/dev/null 2>&1; do
  echo "Waiting for MinIO Object Store..."
  sleep 1
done
echo "✔ MinIO S3 Server is healthy."

echo "========================================================"
echo "✔ ForgeCI Infrastructure is fully operational!"
echo "========================================================"
