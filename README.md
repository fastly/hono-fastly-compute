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
  config: 'ConfigStore:my-config',
});

// Use the inferred Bindings type in your Hono environment
type Env = {
  Bindings: typeof fire.Bindings;
};
const app = new Hono<Env>();

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
- **Returns**: A `fire` function

The returned `fire` function has two purposes:
1. When called with a Hono app instance (`fire(app)`), it registers the app to handle fetch events.
2. It exposes a `Bindings` type (`typeof fire.Bindings`) that you can use to define your Hono `Env`.

### `handle(app, bindingsDefs, options)`

The core adapter function that connects Hono to the Fastly Compute `FetchEvent`. The `buildFire` function is a higher-level utility that uses `handle` internally.

- **`app`**: The Hono application instance.
- **`bindingsDefs`**: The environment bindings definition.
- **`options`**: An optional object with a `fetch` property.

### `clientInfo` and `serverInfo`

`clientInfo` ([ClientInfo](https://github.com/fastly/js-compute-runtime/blob/f9d6a121f13efbb586d6af210dedec61661dfc6d/types/globals.d.ts#L419-L436)) and `serverInfo` ([ServerInfo](https://github.com/fastly/js-compute-runtime/blob/f9d6a121f13efbb586d6af210dedec61661dfc6d/types/globals.d.ts#L438-L446)) are defined on `fire.Bindings` and available on `c.env`, even if the bindings definitions are empty:

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

## Issues

If you encounter any non-security-related bug or unexpected behavior, please [file an issue][bug] using the bug report template.

[bug]: https://github.com/fastly/hono-fastly-compute/issues/new?labels=bug

### Security issues

Please see our [SECURITY.md](SECURITY.md) for guidance on reporting security-related issues.

## License

This project is licensed under the [MIT License](LICENSE).
