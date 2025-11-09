#!/bin/bash

set -e

echo "==> Installing dependencies..."

# Install basic dependencies
sudo apt-get update
sudo apt-get install -y curl git unzip

# Install bun
if ! command -v bun &> /dev/null
then
	echo "Installing Bun..."
	curl -fsSL https://bun.com/install | bash
	export BUN_INSTALL="$HOME/.bun"
	export PATH="$BUN_INSTALL/bin:$PATH"
	echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
	echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
else
	echo "Bun is already installed."
fi

# Install Docker
if ! command -v docker &> /dev/null
then
	echo "Installing Docker..."
	curl -fsSL https://get.docker.com/ | sh
else
	echo "Docker is already installed."
fi

# Install Docker Compose
if docker compose version &> /dev/null
then
	echo "Docker Compose is already installed."
else
	export DOCKER_CONFIG=$HOME/.docker
	DOCKER_COMPOSE_VERSION="2.40.2"

	echo "Installing Docker Compose..."
	mkdir -p $DOCKER_CONFIG/cli-plugins
	curl -L "https://github.com/docker/compose/releases/download/v$DOCKER_COMPOSE_VERSION/docker-compose-$(uname -s)-$(uname -m)" -o $DOCKER_CONFIG/cli-plugins/docker-compose
	chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
	export PATH="$DOCKER_CONFIG/cli-plugins:$PATH"
	echo 'export PATH="$HOME/.docker/cli-plugins:$PATH"' >> ~/.bashrc
fi

# Verify installations
echo ""
echo "==> Verifying installations..."

FAILED=0

if command -v git &> /dev/null; then
	echo "✓ git installed: $(git --version)"
else
	echo "✗ git installation failed"
	FAILED=1
fi

if command -v curl &> /dev/null; then
	echo "✓ curl installed: $(curl --version | head -n1)"
else
	echo "✗ curl installation failed"
	FAILED=1
fi

if command -v unzip &> /dev/null; then
	echo "✓ unzip installed: $(unzip -v | head -n1)"
else
	echo "✗ unzip installation failed"
	FAILED=1
fi

if command -v bun &> /dev/null; then
	echo "✓ bun installed: $(bun --version)"
else
	echo "✗ bun installation failed"
	FAILED=1
fi

if command -v docker &> /dev/null; then
	echo "✓ docker installed: $(docker --version)"
else
	echo "✗ docker installation failed"
	FAILED=1
fi

if docker compose version &> /dev/null; then
	echo "✓ docker compose installed: $(docker compose version)"
else
	echo "✗ docker compose installation failed"
	FAILED=1
fi

if [ $FAILED -eq 1 ]; then
	echo ""
	echo "❌ Some dependencies failed to install. Please check the errors above."
	exit 1
fi

echo ""
echo "==> All dependencies installed successfully!"

# Set up Docker permissions
echo ""
echo "==> Setting up Docker permissions..."
echo "Adding user to docker group (requires sudo)..."
sudo usermod -aG docker $USER

# Clone repository
echo ""
echo "==> Cloning repository..."
git clone https://github.com/Fruup/app-preview.git --depth=1 ./app-preview
cd ./app-preview

# Start traefik (using sudo since group membership isn't active yet)
echo ""
echo "==> Starting Traefik..."
echo "Note: Using sudo for docker commands since group membership requires re-login to take effect"
sudo docker compose --project-directory ./traefik up --build -d --wait

echo ""
echo "🚀 Installation complete!"
echo "Let's move on to the setup. It won't take long!"

# Run setup script
echo ""
echo "==> Running setup..."
bun install
bun run ./src/setup/main.ts

echo ""
echo "ℹ️  Note: Docker group membership has been configured."
echo "   After your next login, you can run docker commands without sudo."
