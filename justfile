#!/usr/bin/env -S just --justfile

set shell := ["bash", "-cu"]

_default:
    @just --list -u

dev *args:
    docker compose -f compose.dev.yaml {{ args }}

ollama *args:
    docker compose -f compose.dev.yaml exec ollama ollama {{ args }}

psql:
    docker compose -f compose.dev.yaml exec -it postgres psql -U postgres

lint: lint-ts lint-sql

lint-ts:
    oxfmt --check
    oxlint --type-aware --type-check

lint-sql:
    sqruff lint

fmt: fmt-ts fmt-sql

fmt-ts:
    oxfmt

fmt-sql:
    sqruff fix

install:
    pnpm install

ui *args:
    pnpm -F web dev {{ args }}