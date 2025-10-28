#!/bin/bash

set -e

apt-get update
apt-get install -y curl unzip

# Install bun
curl -fsSL https://bun.com/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc

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

mkdir -p $DOCKER_CONFIG/cli-plugins
curl -L "https://github.com/docker/compose/releases/download/v$DOCKER_COMPOSE_VERSION/docker-compose-$(uname -s)-$(uname -m)" -o $DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
export PATH="$DOCKER_CONFIG/cli-plugins:$PATH"
echo 'export PATH="$HOME/.docker/cli-plugins:$PATH"' >> ~/.bashrc

# Verify installations
echo "Verifying installations..."

bun --version
docker --version
docker compose version

echo "🚀 Successfully installed"
