FROM oven/bun:latest

RUN apt-get update
RUN apt-get install unzip -y
RUN bun upgrade

RUN apt-get install docker.io -y
RUN apt-get install curl -y
RUN apt-get install git -y
RUN apt-get install gh -y

# Install docker-compose
ENV DOCKER_CONFIG=/home/bun/.docker
RUN mkdir -p $DOCKER_CONFIG/cli-plugins
RUN curl -SL https://github.com/docker/compose/releases/download/v2.40.2/docker-compose-linux-aarch64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
# RUN bun -e "await Bun.write('$DOCKER_CONFIG/cli-plugins/docker-compose', await fetch('https://github.com/docker/compose/releases/download/v2.40.2/docker-compose-linux-aarch64'))"
RUN chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
RUN docker compose version
