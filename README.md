# Hono Adapter for Fastly Compute

This library provides an adapter for using the [Hono](https://hono.dev/) web framework with [Fastly Compute](https://www.fastly.com/products/edge-compute). It simplifies the process of creating Hono applications that run on Fastly's edge platform.

## Features

- **Seamless Integration**: Easily adapt your Hono application to Fastly Compute's event-driven architecture.
- **Type-Safe Bindings**: Automatically infer types for your Fastly resources (like KV Stores and Config Stores) using the `buildFire` function.
- **Simplified Setup**: The `buildFire` utility streamlines the process of setting up your application and its environment bindings.
- **Middleware Utility**: Includes a `logFastlyServiceVersion` middleware for easy debugging and version tracking.

## Installation

```bash
npm install h7-hono-fastly-compute
```

## Usage

Here's a basic example of how to create a Hono application and run it on Fastly Compute.

### Basic Example

```typescript
import { Hono } from 'hono';
import { buildFire } from 'h7-hono-fastly-compute';

// buildFire creates a `fire` function bound to your environment bindings.
// If you have no bindings, pass an empty object.
const fire = buildFire({});

const app = new Hono();

app.get('/', (c) => c.text('Hello from Hono on Fastly Compute!'));

// The fire() function registers your Hono app to handle fetch events.
fire(app);
```

### With Bindings

To use Fastly resources like KV Stores or Config Stores, define them when calling `buildFire`. The types for these bindings will be automatically inferred and made available in your Hono application's context.

```typescript
import { Hono } from 'hono';
import { buildFire } from 'h7-hono-fastly-compute';

// Define your bindings
const fire = buildFire({
  myKVStore: 'KVStore',
  myConfig: 'ConfigStore',
});

// Use the inferred Bindings type in your Hono environment
type Env = {
  Bindings: typeof fire.Bindings;
};

const app = new Hono<Env>();

app.get('/', async (c) => {
  // Access your bindings from the context
  const value = await c.env.myKVStore.get('some-key');
  const config = c.env.myConfig.get('some-config');
  return c.json({ value, config });
});

fire(app);
```

### Using the `logFastlyServiceVersion` Middleware

This package includes a simple middleware to log the `FASTLY_SERVICE_VERSION` for debugging purposes.

```typescript
import { Hono } from 'hono';
import { buildFire, logFastlyServiceVersion } from 'h7-hono-fastly-compute';

const fire = buildFire({});
const app = new Hono();

// Use the middleware
app.use('*', logFastlyServiceVersion());

app.get('/', (c) => c.text('Hello!'));

fire(app);
```

## API

### `buildFire(envBindingsDefs)`

Creates a `fire` function that is bound to a specific set of environment bindings.

- **`envBindingsDefs`**: An object mapping binding names to their resource types (e.g., `{ myKV: 'KVStore' }`).
- **Returns**: A `fire` function.

The returned `fire` function has two purposes:
1.  When called with a Hono app instance (`fire(app)`), it registers the app to handle fetch events.
2.  It exposes a `Bindings` type (`typeof fire.Bindings`) that you can use to define your Hono `Env`.

### `handle(app, envBindingsDefs, options)`

The core adapter function that connects Hono to the Fastly Compute `FetchEvent`. The `buildFire` function is a higher-level utility that uses `handle` internally.

- **`app`**: The Hono application instance.
- **`envBindingsDefs`**: The environment bindings definition.
- **`options`**: An optional object with a `fetch` property.

### `logFastlyServiceVersion()`

A middleware for Hono that logs the `FASTLY_SERVICE_VERSION` environment variable to the console.

## License

This project is licensed under the [MIT License](LICENSE).
