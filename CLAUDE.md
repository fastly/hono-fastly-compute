# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`@fastly/hono-fastly-compute` is a small TypeScript library that adapts the [Hono](https://hono.dev/) web framework to Fastly Compute's Service Worker-style `FetchEvent` model (`@fastly/js-compute` runtime). It is published to npm and GitHub Packages as an ESM-only package.

## Commands

- `npm run build` — compile `src/` to `build/` via `tsc -p tsconfig.build.json` (also runs on `prepack`)
- `npm run clean` — remove `build/` and `test/integration/.work/`
- `npm run clean:build` — remove only `build/`. `prepack` runs this (not `clean`), so that a packed package never contains stale files in `build/`. It must not remove `.work/`: `build-apps.mjs` runs `npm pack` (which runs `prepack`) with `.work/` as the destination.
- `npm test` — `typecheck` + unit tests (fast; no Fastly tooling needed)
- `npm run typecheck` — type-checks `src/` with the root `tsconfig.json` (Compute types only, no Node types, so Node-only APIs in `src/` fail), then `tsc -p test/tsconfig.json` for all test code and the compile-time assertions in `test/types/api.ts` (`@ts-expect-error` lines are assertions that something must *not* compile)
- `npm run test:unit` — `node:test` unit tests in `test/unit/`
- Single test file: `node --import ./test/unit/hooks.ts --test test/unit/handler.test.ts`
- Single test by name: `node --import ./test/unit/hooks.ts --test --test-name-pattern="falls through" "test/unit/**/*.test.ts"` (Node flags must come before the file arguments)
- `npm run test:coverage` — unit tests with coverage of `src/`
- `npm run test:integration` — cleans, builds and packs the library, builds a real Compute app per SDK version, and runs it in Viceroy; needs the Fastly CLI (`fastly` on `PATH`, or `FASTLY_CLI` set) and network access. Takes ~35s for the default versions. Defaults to pinned exact versions (minimum 3.x, latest 3.x, latest 4.x) in `test/integration/sdk-versions.mjs`; override with versions or ranges, e.g. `SDK_VERSIONS="^3,^4"`
- `node --test test/integration/integration.test.ts` — re-run the integration tests against the existing builds (~8s; use the same `SDK_VERSIONS`)

No linter. Node version is pinned in `.nvmrc`; tests run `.ts` files directly via Node's built-in type stripping (no ts-node/tsx). TypeScript is v7.

## Tests

- **Unit** (`test/unit/`): run `src/*.ts` directly in Node. `test/unit/hooks.ts` (loaded with `--import`) resolves `fastly:<name>` imports to fakes in `test/unit/fakes/<name>.ts` and maps `./foo.js` imports to `./foo.ts` (test code also imports with `.js` extensions). The fakes read from `test/unit/fakes/registry.ts`: declare what exists with `provision(kind, ...names)` and `registry.env`; opening anything else throws, like the real runtime. Every lookup is recorded, so tests can assert laziness and caching with `callsFor(kind, name)`; `resetRegistry()` (in `beforeEach`) clears state and recorded calls. `@fastly/compute-js-context` memoizes resource lookups by name for the whole process, which the reset can't clear, so each test must use resource names of its own. `test/unit/helpers/fetch-event.ts` fakes `FetchEvent` and the global `addEventListener`.
- **Integration** (`test/integration/`): two steps. `build-apps.mjs` packs this library and, for each SDK version in `sdk-versions.mjs`, copies `app/` to `.work/sdk-<version>/` (gitignored), installs the tarball and that exact `@fastly/js-compute` version there, type-checks the app against that SDK's types (including `app/src/type-assertions.ts`, which catches published types degrading to `any`), and compiles it with that SDK's `js-compute` to `bin/main.wasm`. Only `npm pack` has its stdout captured; other commands print directly, and a failing command ends the script with a `Failed: <command> (in <dir>)` line. Then `integration.test.ts` serves each build with `fastly compute serve` against a local Node origin server and sends it requests. It writes `.work/sdk-<version>/fastly.toml` from `app/fastly.toml` on each run (the `__ORIGIN_PORT__` placeholder becomes the origin server's port). Viceroy's output goes to `.work/sdk-<version>/serve.log` for debugging. The app's resources (KV/Config/Secret stores, ACL with `app/fixtures/acl.json`, origin backend) are defined in `app/fastly.toml`; Viceroy accepts any Logger name. To cover a new binding or behavior at runtime, add a route to `app/src/index.ts` (plus any resource in `app/fastly.toml`) and an `it()` in `integration.test.ts`; add type expectations to `app/src/type-assertions.ts` and/or `test/types/api.ts`.
- CI: `.github/workflows/ci.yaml` runs `npm test` and the integration tests against the pinned SDK versions. `.github/workflows/sdk-latest.yaml` runs the integration tests weekly (and on demand) against the latest `^3`/`^4`; when a new SDK release passes there, bump the pinned list.

Gotcha: Config Store names in the JS SDK may contain only alphanumerics, underscores, and spaces — a name like `my-config` makes the `ConfigStore` constructor throw, so the binding silently resolves to `undefined`.

## Architecture

Request flow: `fire(app)` → `addEventListener('fetch', handle(...))` → per request, `handle` builds `c.env` and calls `app.fetch(evt.request, env, executionCtx)`.

- `src/handler.ts` — `handle()` is the core adapter. For each `FetchEvent` it builds `env` by seeding `{ clientInfo: evt.client, serverInfo: evt.server }` and layering user bindings on top with `buildContextProxyOn` from `@fastly/compute-js-context` (which lazily resolves Fastly resources like `KVStore`, `ConfigStore`, using `'ResourceType'` or `'ResourceType:actual-name'` strings). The `FetchEvent` itself is reused as Hono's `executionCtx` (with a throwing `passThroughOnException` stub). If `opts.fetch` is set and Hono returns 404, the request falls through to that fetch.
- `src/fire.ts` — `buildFire(defs)` returns a `fire` function whose type carries a phantom `Bindings` property (`typeof fire.Bindings`) so users get inferred `c.env` types. `FireFn` has two overloads: one accepting apps with no declared Bindings (only when `defs` is empty) and one requiring `{ Bindings: BindingsWithClientInfo<D> }`. `fire` also calls `app.router.match('', '')` before registering, to force router cache construction during the Wizer pre-initialization snapshot. The exported `fire`/`Bindings` are just `buildFire({})`.
  - Note: `fire` passes `{ fetch: undefined }` as the default options (no fallthrough), whereas calling `handle` directly defaults to `globalThis.fetch.bind(globalThis)`.
- `src/conninfo.ts` — Hono `GetConnInfo` implementation reading `c.env.clientInfo`.
- `src/utils.ts` — `logFastlyServiceVersion()` middleware; imports `fastly:env`, a Fastly runtime built-in module.
- `src/index.ts` — barrel export; re-exports types from `@fastly/compute-js-context` and augments `hono/types`' `FetchEventLike` with `client`/`server`.

`ClientInfo`, `ServerInfo`, `FetchEvent`, and `fastly:*` modules are ambient types from `@fastly/js-compute` (configured via `types` in `tsconfig.json`). Source imports use `.js` extensions (NodeNext module resolution). `verbatimModuleSyntax` and `erasableSyntaxOnly` are on, because the unit tests run the sources with Node's type stripping: type-only imports must use `import type` / `{ type X }`, and enums, namespaces and parameter properties are not allowed. Supported SDK range: `@fastly/js-compute` `^3.33.0 || ^4.0.0` (peer dependency; 3.32.x doesn't load the `fastly:acl` types that `@fastly/compute-js-context` needs).

## Conventions

- Source files carry the Fastly copyright/MIT header comment.
- Keep the README API section in sync when changing public exports.
- Update `CHANGELOG.md` (Keep a Changelog format, `[unreleased]` section) for user-facing changes.

## Releasing

Pushing a `v*` tag triggers `.github/workflows/ci-release.yaml`, which uses Fastly's reusable devex workflows to publish to npm and GitHub Packages. The tag must match `package.json`'s `version` (bumped via `npm version`).
