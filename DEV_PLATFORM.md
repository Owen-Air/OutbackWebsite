# Dev Platform Guide

## Deployment scope

This repository is configured for dev-only runtime deployment to the existing Cloudflare Worker service outbackwebsitedev.

## Commands

- Build static assets: npm run build
- Typecheck: npm run typecheck
- Test: npm run test
- Deploy dev runtime: npm run deploy

## Runtime architecture

- worker.ts: typed request pipeline and route dispatch
- app/lib: shared response, security, validation, and logging modules
- platform: domain services for forms, data, jobs, media, and metrics
- functions: Pages-compatible endpoint modules kept in sync with shared contracts

## API contract

All API responses use this structure:

- success: boolean
- data: optional typed payload
- error: optional { code, message }
- meta: { requestId, timestamp }

## Security baseline

- strict response security headers applied in worker pipeline
- server-side Turnstile verification
- rate limiting hooks via KV
- structured JSON logging
- strict webhook HMAC verification
- payload size and content-type enforcement

## Observability

- request ID and trace ID on all responses
- request completion logs include route, status, latency
- /api/health endpoint for dependency checks
- /api/metrics endpoint for in-process counters
