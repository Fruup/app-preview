#!/bin/bash

set -e

apt-get update
apt-get install -y curl unzip

# Install bun
curl -fsSL https://bun.com/install | bash
# export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Install Docker
if ! command -v docker &> /dev/null
then
	curl -fsSL https://get.docker.com/ | sh
else
	echo "Docker is already installed."
fi

# Install Docker Compose
export DOCKER_CONFIG=$HOME/.docker
DOCKER_COMPOSE_VERSION="2.40.2"

RUN mkdir -p $DOCKER_CONFIG/cli-plugins
curl -L "https://github.com/docker/compose/releases/download/$DOCKER_COMPOSE_VERSION/docker-compose-$(uname -s)-$(uname -m)" -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose

# Verify installations
echo "Verifying installations..."

bun --version
docker --version
docker compose version

echo "🚀 Successfully installed"
