# IoT-26-Project

## Requirements

- Docker daemon running
- Node.js 22
- pnpm 11.5.0

Optional:

- Nix with flakes enabled
- just

## Run

With Nix:

```sh
nix develop
```

Without Nix, install Node.js 22 and enable pnpm through Corepack:

```sh
corepack enable
corepack prepare pnpm@11.5.0 --activate
```

Then run:

```sh
cp .env.example .env
cp packages/web/.env.example packages/web/.env
pnpm install
docker compose -f compose.dev.yaml up -d postgres dex n8n
pnpm -F @iot-26-project/web dev
```

Open <http://localhost:3000>.

Test logins:

- `admin@example.com` / `password`
- `foo@bar.com` / `password`

## Useful Commands

```sh
docker compose -f compose.dev.yaml ps
docker compose -f compose.dev.yaml down
docker compose -f compose.dev.yaml exec -it postgres psql -U postgres
```

If `just` is installed, the shortcuts are `just dev ps`, `just dev down`, `just psql`, and `just ui`.

The Ollama service is also defined in `compose.dev.yaml`, but it is not required for the default web app startup.
