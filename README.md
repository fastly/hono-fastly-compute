# Hono Adapter for Fastly Compute

> NOTE: `@fastly/hono-fastly-compute` is provided as a Fastly Labs product. Visit the [Fastly Labs](https://www.fastlylabs.com/) site for terms of use.

This library provides an adapter for using the [Hono](https://hono.dev/) web framework with [Fastly Compute](https://www.fastly.com/products/edge-compute). It simplifies the process of creating Hono applications that run on Fastly's edge platform.

## Features

- **Seamless Integration**: Easily adapt your Hono application to Fastly Compute's event-driven architecture.
- **Type-Safe Bindings**: Automatically infer types for your Fastly resources (like KV Stores and Config Stores) using the `buildFire` function.
- **Simplified Setup**: The `buildFire` utility streamlines the process of setting up your application and its environment bindings.
- **Middleware Utility**: Includes a `logFastlyServiceVersion` middleware for easy debugging and version tracking.

## Installation

```bash
npm install @fastly/hono-fastly-compute
```

Requires a [Fastly Compute JavaScript project](https://www.fastly.com/documentation/guides/compute/developer-guides/javascript/) using `@fastly/js-compute` `^3.33.0` or `^4.0.0`, and `hono` `^4.5.0`.

## Usage

Here's a basic example of how to create a Hono application and run it on Fastly Compute.

### Basic Example

```typescript
import { Hono } from 'hono';
import { buildFire } from '@fastly/hono-fastly-compute';

// buildFire creates a `fire` function bound to your environment bindings.
// If you have no bindings, pass an empty object.
const fire = buildFire({
  assets: 'KVStore',
  config: 'ConfigStore:my_config',
});

// Use the inferred Bindings type in your Hono environment
const app = new Hono<{ Bindings: typeof fire.Bindings }>();

app.get('/', async (c) => {
  // Access your bindings from the context
  const value = await c.env.assets.get('some-key');
  const setting = c.env.config.get('some-setting');
  return c.json({ value, setting });
});

fire(app);
```

### Example with no user resources

An application that defines no user resources is even simpler:

```typescript
import { Hono } from 'hono';
import { fire, type Bindings } from '@fastly/hono-fastly-compute';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', async (c) => {
  // `clientInfo` and `serverInfo` are always available on `c.env`.
  const clientInfo = c.env.clientInfo;
  c.text(`Accessed from ${clientInfo.address}`);
});

fire(app);
```

### Using the `logFastlyServiceVersion` Middleware

This package includes a simple middleware to log the `FASTLY_SERVICE_VERSION` for debugging purposes.

```typescript
import { Hono } from 'hono';
import { fire, logFastlyServiceVersion } from '@fastly/hono-fastly-compute';

const app = new Hono();

// Use the middleware
app.use('*', logFastlyServiceVersion());

app.get('/', (c) => c.text('Hello!'));

fire(app);
```

## API

### `buildFire(bindingsDefs)`

Creates a `fire` function that is bound to a specific set of environment bindings.

- **`bindingsDefs`**: An object mapping binding names to their resource types
   - Keys: The property name used to access the resource
   - Values: A string in the format 'ResourceType'
      - If the actual name of the object differs from the Key, or if its name
         is not a valid JavaScript identifier, use 'ResourceType:actual-name'
      - `ResourceType` is one of `Acl`, `Backend`, `ConfigStore`, `env`
         (an environment variable), `KVStore`, `Logger`, or `SecretStore`
- **Returns**: A `fire` function

Resources are looked up lazily, the first time a binding is accessed, and
cached. If a resource doesn't exist (or isn't linked to your service), its
binding is `undefined`. Note that Config Store names can only contain letters,
digits, underscores, and spaces; a name such as `my-config` can't be opened, so
its binding is always `undefined`.

The returned `fire` function has two purposes:
1. When called with a Hono app instance (`fire(app)`), it registers the app to handle fetch events.
2. It exposes a `Bindings` type (`typeof fire.Bindings`) that you can use to define your Hono `Env`.

### `fire(app, options)`

Registers your Hono app to handle fetch events. No user-defined bindings are
applied to `c.env`. Equivalent to the return value of `buildFire({})`.

### Type `Bindings`

Default bindings which can be used when no user-defined bindings are present. Alias of `fire.Bindings`.

### `handle(app, bindingsDefs, options)`

The core adapter function that connects Hono to the Fastly Compute `FetchEvent`. The `fire` function is a higher-level utility that uses `handle` internally.

- **`app`**: The Hono application instance. If `bindingsDefs` is not empty, the
   app's `Bindings` must be `BindingsWithClientInfo<typeof bindingsDefs>`. If it
   is empty, the app does not have to declare `Bindings`.
- **`bindingsDefs`**: The environment bindings definition.
- **`options`**: An optional object with a `fetch` property.

### `clientInfo` and `serverInfo`

`clientInfo` ([ClientInfo](https://github.com/fastly/js-compute-runtime/blob/f9d6a121f13efbb586d6af210dedec61661dfc6d/types/globals.d.ts#L419-L436)) and `serverInfo` ([ServerInfo](https://github.com/fastly/js-compute-runtime/blob/f9d6a121f13efbb586d6af210dedec61661dfc6d/types/globals.d.ts#L438-L446)) are always defined on `fire.Bindings` and can be made available on `c.env`, even if the bindings definitions are empty:

```typescript
import { Hono } from 'hono';
import { fire, type Bindings } from '@fastly/hono-fastly-compute';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', (c) => {
  const clientInfo = c.env.clientInfo;
  const serverInfo = c.env.serverInfo;

  c.text(`${clientInfo.address} ${serverInfo.address}`);
});

fire(app);
```

### `logFastlyServiceVersion()`

A Hono middleware that logs to the console the string `FASTLY_SERVICE_VERSION` followed by the value of the environment variable **FASTLY_SERVICE_VERSION**.

### `getConnInfo()`

An implementation of the [ConnInfo helper](https://hono.dev/docs/helpers/conninfo) for Fastly Compute.

```typescript
import { Hono } from 'hono';
import { fire, getConnInfo } from '@fastly/hono-fastly-compute';

const app = new Hono();

app.get('/', (c) => {
  const info = getConnInfo(c); // info is `ConnInfo`
  return c.text(`Your remote address is ${info.remote.address}`);
});

fire(app);
```

## Development

```bash
npm install
npm run build              # compile src/ to build/
npm test                   # type tests + unit tests
npm run test:coverage      # unit tests with a coverage report
npm run test:integration   # integration tests (requires the Fastly CLI)
```

### Unit and type tests

Unit tests live in `test/unit/` and use Node's built-in test runner (`node:test`), running the TypeScript sources directly. Since the `fastly:*` modules only exist inside the Compute runtime, `test/unit/hooks.ts` (loaded with `--import`) resolves them to in-memory fakes in `test/unit/fakes/`. Tests declare which resources exist with `provision()` from `test/unit/fakes/registry.ts`; looking up anything else throws, as it does in the real runtime.

To run a single file or test:

```bash
node --import ./test/unit/hooks.ts --test test/unit/handler.test.ts
node --import ./test/unit/hooks.ts --test --test-name-pattern="falls through" "test/unit/**/*.test.ts"
```

Type tests in `test/types/` are compile-time assertions about the public types, checked by `npm run typecheck`.

### Integration tests

Integration tests run a real Hono app (`test/integration/app/`) inside the Compute runtime, against several versions of `@fastly/js-compute`: by default, the minimum supported 3.x, the latest 3.x, and the latest 4.x, pinned to exact versions in `test/integration/sdk-versions.mjs`:

1. `npm run test:integration` cleans, then builds the library to `build/`.
2. `test/integration/build-apps.mjs` packs the library with `npm pack`. For each SDK version, it installs the tarball and that SDK version into a copy of the app under `test/integration/.work/sdk-<version>/`, type-checks the app against that SDK's types, and compiles it with that SDK's `js-compute`.
3. `test/integration/integration.test.ts` serves each build with `fastly compute serve` (Viceroy), using the local resources declared in `test/integration/app/fastly.toml`, and sends it requests.

These require the [Fastly CLI](https://www.fastly.com/documentation/reference/tools/cli/) on your `PATH` (set `FASTLY_CLI` to use a different binary), and network access to install each SDK version. Viceroy's output for each version is saved to `test/integration/.work/sdk-<version>/serve.log`.

To test other SDK versions, set `SDK_VERSIONS` to comma-separated versions or ranges:

```bash
SDK_VERSIONS="^3,^4" npm run test:integration
```

After a build, the tests can be re-run without rebuilding with `node --test test/integration/integration.test.ts`.

CI runs the tests on pull requests and pushes to `main`, and also runs the integration tests weekly against the latest `^3` and `^4`.

## Issues

If you encounter any non-security-related bug or unexpected behavior, please [file an issue][bug] using the bug report template.

[bug]: https://github.com/fastly/hono-fastly-compute/issues/new?labels=bug

### Security issues

Please see our [SECURITY.md](SECURITY.md) for guidance on reporting security-related issues.

## License

This project is licensed under the [MIT License](LICENSE).
