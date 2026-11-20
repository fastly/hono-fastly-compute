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
  // Access your bindings from the context. A binding is undefined if its
  // resource does not exist or is not linked to the service.
  const { assets, config } = c.env;
  if (assets == null || config == null) {
    return c.text('Resource not linked', 500);
  }
  const entry = await assets.get('some-key');
  const setting = config.get('some-setting');
  return c.json({ value: await entry?.text(), setting });
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

The type of each binding includes `undefined`, for example `KVStore | undefined`,
so TypeScript makes you check a binding before you use it. The type of one
binding is `BindingResource<'KVStore:my-kv-store'>`, and the type of all user
bindings is `BindingsResources<typeof bindingsDefs>`.

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

## Fastly Hono Compose

**Fastly Hono Compose** (`@fastly/hono-fastly-compute/compose`) is a plugin system for a Hono app on Fastly Compute. Each **plugin** is a module that default-exports `definePlugin(…)`. A plugin adds its code to the app in **phases**. A **host** (for example a package that serves a static site) gives the list of steps of the app: the phases, and its own steps between them. `compose()` runs the list.

Every app has two phases, in this order:

| Phase | What a plugin adds there |
|---|---|
| `middleware` | Middleware that wraps each request. The code before `await next()` runs on the way in, in the order of the plugins. The code after it runs on the way out, in the reverse order. All middleware is added before any route, so each middleware wraps each route. |
| `routes` | Routes. The first route that answers wins. |

A host can add phases and steps. For example, a host that serves files has the list `CORE_PHASES`, `files`, `afterFilesRoutes`, `fallback`: the routes of the `routes` phase win over the files, and the routes of `afterFilesRoutes` answer only when no file does.

```typescript
// a plugin
import { definePlugin } from '@fastly/hono-fastly-compute/compose';

export default definePlugin({ bindings: { config: 'ConfigStore:site_config' } }, {
  middleware: (app) => {
    app.use('*', async (c, next) => {
      const start = performance.now();
      await next();
      c.res.headers.set('Server-Timing', `app;dur=${performance.now() - start}`);
    });
  },
  routes: (app) => {
    app.get('/api/hello', (c) => c.json({ hello: c.env.config?.get('name') ?? 'world' }));
  },
});
```

The plugins are the files of a folder, by default `hono-compose/`. Before each build, the app bundles them into one file, `src/hono-compose.generated.js` (see [The folder of plugins](#the-folder-of-plugins)):

```typescript
// the app (src/index.ts)
import { Hono } from 'hono';
import { buildFire } from '@fastly/hono-fastly-compute';
import { compose, mergeBindings } from '@fastly/hono-fastly-compute/compose';
import { plugins } from './hono-compose.generated.js';

// The bindings of the app and of the plugins.
const fire = buildFire(mergeBindings({}, plugins));
const app = new Hono<{ Bindings: typeof fire.Bindings }>();
compose(app, plugins);
fire(app);
```

### `definePlugin([options,] phases)`

Makes a plugin. The default export of a plugin module.

- **`options.bindings`**: The bindings that the plugin uses on `c.env`, in the format of `buildFire()`. In the plugin, `c.env` has the type of these bindings, with `| undefined`.
- **`phases`**: A function, which is the `middleware` phase, or an object with a function for each phase that the plugin uses. Each function gets `(app, options, helpers)`: the app, the options of the plugin (see `compose()`), and the helpers of the host.

The type parameter of `definePlugin<O>()` is the type of the options.

### `defineComposeHost({ steps, helpers })`

Makes a host. Call it at the top level of the app.

- **`steps`**: The list of steps, in order. Each entry is one of:
   - `CORE_PHASES`: the phases `middleware` and `routes`. The list must have it exactly once.
   - A string: a phase of the host, where the plugins can add code.
   - `[ name, fn ]`: a step of the host. `fn` gets `(app, helpers)`.

   The names must all be different. A phase before `CORE_PHASES` runs before the middleware of all plugins, so a plugin must add only middleware to it.
- **`helpers`**: The value that each phase function of a plugin and each host step gets as `helpers`.

It throws if the list is not correct.

To give the plugins the names of the phases and the type of the helpers, register the host:

```typescript
declare module '@fastly/hono-fastly-compute/compose' {
  interface ComposeHostRegistry {
    host: typeof host;
  }
}
```

Without a registered host, a plugin has the phases `middleware` and `routes`, and no helpers.

### `compose(app, plugins, options)`

Runs the list of steps of the host on `app`: for each phase, the function of that phase of each plugin, in the order of `plugins`; for each host step, its function. Call it at the top level of the app, so that an error stops the build.

- **`plugins`**: The list of plugins (`PluginEntry[]`): for each plugin, its `name`, its `file` (for messages), and the `plugin` (the default export of its module).
- **`options.host`**: The host. Default: `CORE_PHASES` only, with no helpers.
- **`options.pluginOptions`**: The options of each plugin, by the name of the plugin.

It throws if a module does not default-export `definePlugin(…)`, or if a plugin has a phase that the host does not have. The message names the file.

### Examples

[`examples/compose/`](examples/compose/) has a base app, and examples of plugins to copy into it:

- [`app/`](examples/compose/app/): a Hono app with Compose, the folder `hono-compose/`, and its prebuild script. Copy it to start an app.
- [`grip/`](examples/compose/grip/): realtime streams with Fastly Fanout (GRIP).
- [`oauth/`](examples/compose/oauth/): a login with GitHub or Google.

The examples are not part of the package. Each one is a starting point: after you copy it, the code is yours.

### The folder of plugins

`@fastly/hono-fastly-compute/compose/build` runs in Node, before the build of the app. It bundles the plugins of a folder into one file of the app (the manifest), which exports `plugins` for `compose()`. Never import it in the code of the app.

The plugins are the files directly in the folder with the extension `.js`, `.mjs`, `.ts`, or `.mts`, in file-name order. The name of a plugin is its file name without an order prefix (`10-`) and without the extension: `10-auth.ts` is the plugin `auth`. These files are not plugins: files that start with `_` or `.`, `.d.ts` files, and the files in subfolders (for example `lib/`), so a plugin can import its helpers from them. `index` is a reserved name: a file `index.ts` (or `.js`, `.mjs`, `.mts`) stops the build.

The packages in the `dependencies` of the app's `package.json`, this package, and the `fastly:*` modules stay imports in the bundle, so that the app has one copy of each. The folder can have its own `package.json` for its other packages. If it asks for a version of a package that the app provides, and the app has another version, the build shows a warning and uses the app's version.

A prebuild script of the app, for example `scripts/prebuild.mjs` with `"prebuild": "node scripts/prebuild.mjs"` in `package.json`:

```javascript
import * as esbuild from 'esbuild';
import { bundlePlugins } from '@fastly/hono-fastly-compute/compose/build';

await bundlePlugins({ appDir: process.cwd(), esbuild });
```

The app passes its own `esbuild` (a dev dependency of the app), so that this package does not depend on it. Add `src/hono-compose.generated.js` and `src/hono-compose.generated.d.ts` to `.gitignore`.

#### `bundlePlugins(options)`

Bundles the plugins into the manifest, and writes its types (the same file name with `.d.ts`). Without the folder, or without plugins, it writes a manifest with no plugins. It writes a file only if its content changes. Returns `true` if it wrote the manifest.

- **`appDir`**: The directory of the app (the directory of its `package.json`).
- **`esbuild`**: The `esbuild` module of the app.
- **`dir`**: The folder of the plugins, relative to `appDir`. Default: `./hono-compose`.
- **`manifest`**: The manifest, relative to `appDir`. Default: `src/hono-compose.generated.js`.
- **`pluginOptions`**: The options that the app gives to `compose()`. The build warns about a name that no plugin has. **`pluginOptionsSource`** is the name of these options in that warning.
- **`hint`**: A sentence at the end of each warning about versions, for example a command that updates the folder's `package.json`.

#### `watchPlugins(options)`

Bundles the plugins, then watches the folder and bundles them again after each change, for development (for example next to `fastly compute serve --watch`, which then sees the new manifest and builds the app again). It also finds a folder that is made later. A failed bundle shows the error and keeps the manifest. Takes the options of `bundlePlugins()`, and returns an object with `close()`.

#### Other functions

- **`writePluginsStub({ appDir, manifest })`**: Writes a manifest with no plugins, and its types, so that the app can import it before the first build.
- **`listPlugins(dir)`**: The plugins of a folder (`{ name, file }[]`).
- **`pluginsDir({ appDir, dir })`**: The folder of the plugins, as an absolute path.
- **`pluginsExternals(appDir)`**: The packages that stay imports in the bundle.
- **`checkProvidedVersions(appDir, dir, { hint })`**: The warnings about versions.

### `mergeBindings(appBindings, plugins, options)`

Merges the bindings of the app with the bindings of the plugins, for `buildFire()`. The same name with the same resource is allowed. One name with two different resources throws, with a message that names the sources. `options.appBindingsSource` is the name of the bindings of the app in that message.

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

### Example tests

`npm run test:examples` builds the library, and tests the examples of `examples/compose/` (`test/examples/examples.test.ts`). For each example, it copies the base app to `test/examples/.work/<name>/`, puts the example in `hono-compose/`, installs this package from `npm pack`, type-checks and builds the app, serves it with `fastly compute serve`, and sends it requests. It needs the Fastly CLI and network access. The GRIP test also needs [Pushpin](https://pushpin.org/) on your `PATH`. Without the Fastly CLI, the tests are skipped, and without Pushpin, the GRIP test is skipped.

One test deploys both examples to a real service. **It replaces the active version of that service.** It runs only when these variables are set:

| Variable | |
| --- | --- |
| `FASTLY_API_TOKEN` | A Fastly API token that can deploy to the service. |
| `HFC_TEST_DEPLOY_SERVICE_ID` | The ID of the service. |
| `HFC_TEST_DEPLOY_URL` | The URL of the service, for example `https://example.edgecompute.app`. |
| `HFC_TEST_GRIP_PUBLISH_KEY` | The value of `PUBLISH_KEY` in the Secret Store of the service. |
| `HFC_TEST_OAUTH_SESSION_KEY` | The value of `SESSION_KEY` in the Secret Store of the service. |

The service must have Fanout turned on, a backend `self` to its own domain, and one Secret Store, linked with the names `grip` and `oauth`, with the entries `PUBLISH_KEY`, `FANOUT_API_TOKEN`, `SESSION_KEY`, and `GITHUB_CLIENT_SECRET` (any value).

CI runs the tests on pull requests and pushes to `main`, and also runs the integration tests weekly against the latest `^3` and `^4`.

## Issues

If you encounter any non-security-related bug or unexpected behavior, please [file an issue][bug] using the bug report template.

[bug]: https://github.com/fastly/hono-fastly-compute/issues/new?labels=bug

### Security issues

Please see our [SECURITY.md](SECURITY.md) for guidance on reporting security-related issues.

## License

This project is licensed under the [MIT License](LICENSE).
