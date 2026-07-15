#!/bin/bash
set -e

echo "Starting deployment process for DNSE service..."

# Build the Docker image
echo "Building Docker image..."
docker compose build

# Start the services (recreates if needed)
echo "Starting services..."
docker compose up -d

echo "Deployment completed successfully! Checking logs:"
docker compose logs --tail 10
