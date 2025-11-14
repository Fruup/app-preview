Kind of like Coolify & Dokploy.

# Installation

`sudo curl https://raw.githubusercontent.com/Fruup/app-preview/refs/heads/main/install.sh | bash`

# TODO

- [ ] Quickly spin up/down projects from git repos
- [x] GitHub integration
  - [x] support for private repos
  - [x] Preview deployments from PRs
- [x] 1Password integration
- [ ] Enable app preview by default for repositories that are
  - selected as accessible by the GitHub app installation
  - and have an `app-preview.config.{ts,js}` file somewhere (use `libgit2` for in-memory cloning and globbing?)
- [ ] Check if infra config has changed. If not, we can just pull and recreate containers.

.
