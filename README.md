# Startup

## Run services

Copy `.env.example` to `.env` and adjust if needed.

```sh
just dev up
```

*(Keep terminal in background, or run with `-d`)*

## Pull Ollama Model

```sh
just ollama pull qwen3:8b
```

## Start UI

Copy `packages/web/.env.example` to `packages/web/.env` and adjust if needed.

```sh
just install
just ui
```

Log in at <http://localhost:3000> with `admin@example.com` and `password`.

*(There might be an SSR error, in this case edit and save `packages/web/vite.config.ts`, with a newline for example, to force the server to reload)*