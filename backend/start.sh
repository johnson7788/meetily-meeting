#!/bin/bash
cd "$(dirname "$0")/.."
uv run --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 5167 --reload
