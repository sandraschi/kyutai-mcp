set shell := ["powershell.exe", "-NoProfile", "-Command"]

default:
  @just --list

lint:
  uv run ruff check .

fmt:
  uv run ruff format .

test:
  uv run pytest -q

serve:
  uv run python -m kyutai_mcp

web:
  Set-Location webapp; .\\start.ps1

