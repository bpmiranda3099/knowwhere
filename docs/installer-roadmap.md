# KnowWhere Installer & Distribution Plan

This document tracks the future, not-yet-implemented installer/distribution flow for deploying KnowWhere via native package managers and a licensing gate.

## Goals
- Ship a guided installer across Windows (winget/MSI), macOS (Homebrew tap), and Linux (Homebrew on Linux), backed by one cross-platform core binary.
- Require a serial key issued from the web licensing service before installation proceeds.
- Collect source DB details (MySQL/PostgreSQL) with a read-only user and migrate data into the KnowWhere Postgres (pgvector) instance, then run TSV + embedding backfills.
- Validate and guide prerequisite setup (Docker/Compose, Git, Node/Python if needed, optional NVIDIA stack for GPU builds).

## Licensing service (web)
- Endpoint: `POST /license/validate { key, machineId } -> { ok, token, expiry, reason }`.
- Serial keys stored in MongoDB (status, expiry, install counts) and served via the licensing API for installer validation.
- Users generate keys after OAuth sign-up (e.g., Google/Gmail); keys are tied to that account and can be activated/revoked from the website.
- Issues a signed token (JWT, RS256) used by the installer to gate the rest of the workflow; caches locally to avoid revalidation mid-run. Bundle the public key with the installer for offline verification and rotate signing keys via the licensing service.
- Tracks status (active/revoked), expiry, and allowed installs; generated from an admin page on the official site.

## Core installer (shared logic)
- Prefer Go for static binaries; alternatives: Python/Node if bundled.
- Steps:
  1) Prompt for serial; validate via licensing endpoint.
  2) Prompt for DB engine (MySQL/Postgres), host/port, DB name, tables, and read-only user credentials.
  3) Probe schema/permissions; confirm expected columns for academic resources/books.
  4) Detect prerequisites (Docker/Compose or Podman, Git, Node/Python if required, GPU/NVIDIA if selected) and guide installation if missing.
  5) Fetch code: git clone repo (or use bundled tarball for offline); fetch reranker/embedding models or use bundled HF cache.
  6) Write `.env` and config files from prompts.
  7) `docker compose build/pull && docker compose up -d` (or Podman) for API, web, embedding, reranker, Postgres.
  8) Apply DB schema/roles to KnowWhere Postgres.
  9) Migrate data from the source DB into KnowWhere; then run `npm run backfill:tsv` and `npm run backfill:embeddings`.
  10) Health-check endpoints (API 3000, embedding 8081, reranker 8082, web 8080, DB 5432) and emit a report/log location.

## Windows distribution (winget)
- Build a code-signed MSI (WiX/Burn) that wraps the core binary and installs to `Program Files\\KnowWhere`.
- Winget manifest (under `manifests/k/KnowWhere/KnowWhere/<version>/`):
  - `installerType: msi`, `installerUrl`, `installerSha256`, `productCode`, `Commands: [knowwhere-installer]`.
- Post-install: shortcuts to the installer launcher and logs; ensure Docker Desktop/WSL2 guidance if not present.
- Publish to winget-pkgs via PR each release; host stable versioned MSI URLs.

## macOS distribution (Homebrew)
- Homebrew tap (`yourorg/homebrew-knowwhere`) with a formula that fetches a notarized/signed tarball per arch (arm64/x64).
- Installs `knowwhere-installer` into the PATH; optional lightweight SwiftUI helper for UI prompts.
- Depends on Docker Desktop (or instructs user), Git; handles Rosetta check if using x64 bits on Apple Silicon.

## Linux distribution (Homebrew on Linux)
- Same tap with `on_linux` block pointing to Linux x64/arm64 tarballs.
- Declares dependencies (`docker`, `git`) or checks in the installer.

## Release process
- Versioned artifacts: `knowwhere-installer_vX.Y.Z_<os>_<arch>.tar.gz` with published SHA256 sums.
- Update winget manifest and Homebrew formula per release; keep changelog and download URLs stable.
- Optional offline bundle: tarball with repo + model cache for air-gapped installs.
