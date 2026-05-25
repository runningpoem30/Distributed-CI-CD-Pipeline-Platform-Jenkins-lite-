#!/bin/bash
set -e

echo "========================================================"
echo "Building ForgeCI Monorepo Modules..."
echo "========================================================"

cd "$(dirname "$0")/.."

# Check if Maven wrapper exists, otherwise use fallback mvn
if [ -f "./mvnw" ]; then
  MVN_CMD="./mvnw"
else
  MVN_CMD="mvn"
fi

echo "--> Building Backend services..."
$MVN_CMD clean install -DskipTests

echo "--> Building Web interface..."
cd apps/web
npm install
npm run build

echo "========================================================"
echo "✔ All ForgeCI services compiled successfully!"
echo "========================================================"
