# Startup

## Run services

Copy `.env.example` to `.env`, then select the configuration for your GPU.

For NVIDIA GPUs:

```env
GPU_FLAVOR=latest
COMPOSE_FILE=compose.dev.yaml:compose.dev.nvidia.yaml
```

For AMD GPUs:

```env
GPU_FLAVOR=rocm
COMPOSE_FILE=compose.dev.yaml:compose.dev.rocm.yaml
```

```sh
just dev up
```

*(Keep terminal in background, or run with `-d`)*

## Pull Ollama Model

```sh
just ollama pull qwen3.5:4b
```

## Start UI

Copy `packages/web/.env.example` to `packages/web/.env` and adjust if needed.

```sh
just install
just ui
```

Log in at <http://localhost:3000> with `admin@example.com` and `password`.

*(There might be an SSR error, in this case edit and save `packages/web/vite.config.ts`, with a newline for example, to force the server to reload)*