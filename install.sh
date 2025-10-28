#!/bin/bash

set -e

apt-get update
apt-get install -y curl unzip

# Install bun
curl -fsSL https://bun.com/install | bash

# Install Docker
curl -fsSL https://get.docker.com/ | sh

# Install Docker Compose
DOCKER_COMPOSE_VERSION="2.40.2"
curl -L "https://github.com/docker/compose/releases/download/$DOCKER_COMPOSE_VERSION/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify installations
echo "Verifying installations..."
bun --version
docker --version
docker-compose --version

echo "🚀 Successfully installed"
