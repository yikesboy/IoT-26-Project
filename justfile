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