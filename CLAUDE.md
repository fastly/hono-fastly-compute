# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`@fastly/hono-fastly-compute` is a small TypeScript library that adapts the [Hono](https://hono.dev/) web framework to Fastly Compute's Service Worker-style `FetchEvent` model (`@fastly/js-compute` runtime). It is published to npm and GitHub Packages as an ESM-only package.

## Commands

- `npm run build` — compile `src/` to `build/` via `tsc -p tsconfig.build.json` (also runs on `prepack`)
- `npm run clean` — remove `build/`
- Typecheck only: `npx tsc -p tsconfig.json --noEmit`

There is no test suite, linter, or local runner in this repo; the code only executes inside a Fastly Compute (Wasm) environment. Node version is pinned in `.nvmrc`.

## Architecture

Request flow: `fire(app)` → `addEventListener('fetch', handle(...))` → per request, `handle` builds `c.env` and calls `app.fetch(evt.request, env, executionCtx)`.

- `src/handler.ts` — `handle()` is the core adapter. For each `FetchEvent` it builds `env` by seeding `{ clientInfo: evt.client, serverInfo: evt.server }` and layering user bindings on top with `buildContextProxyOn` from `@fastly/compute-js-context` (which lazily resolves Fastly resources like `KVStore`, `ConfigStore`, using `'ResourceType'` or `'ResourceType:actual-name'` strings). The `FetchEvent` itself is reused as Hono's `executionCtx` (with a throwing `passThroughOnException` stub). If `opts.fetch` is set and Hono returns 404, the request falls through to that fetch.
- `src/fire.ts` — `buildFire(defs)` returns a `fire` function whose type carries a phantom `Bindings` property (`typeof fire.Bindings`) so users get inferred `c.env` types. `FireFn` has two overloads: one accepting apps with no declared Bindings (only when `defs` is empty) and one requiring `{ Bindings: BindingsWithClientInfo<D> }`. `fire` also calls `app.router.match('', '')` before registering, to force router cache construction during the Wizer pre-initialization snapshot. The exported `fire`/`Bindings` are just `buildFire({})`.
  - Note: `fire` passes `{ fetch: undefined }` as the default options (no fallthrough), whereas calling `handle` directly defaults to `globalThis.fetch.bind(globalThis)`.
- `src/conninfo.ts` — Hono `GetConnInfo` implementation reading `c.env.clientInfo`.
- `src/utils.ts` — `logFastlyServiceVersion()` middleware; imports `fastly:env`, a Fastly runtime built-in module.
- `src/index.ts` — barrel export; re-exports types from `@fastly/compute-js-context` and augments `hono/types`' `FetchEventLike` with `client`/`server`.

`ClientInfo`, `ServerInfo`, `FetchEvent`, and `fastly:*` modules are ambient types from `@fastly/js-compute` (configured via `types` in `tsconfig.json`). Source imports use `.js` extensions (NodeNext module resolution).

## Conventions

- Source files carry the Fastly copyright/MIT header comment.
- Keep the README API section in sync when changing public exports.
- Update `CHANGELOG.md` (Keep a Changelog format, `[unreleased]` section) for user-facing changes.

## Releasing

Pushing a `v*` tag triggers `.github/workflows/ci-release.yaml`, which uses Fastly's reusable devex workflows to publish to npm and GitHub Packages. The tag must match `package.json`'s `version` (bumped via `npm version`).
