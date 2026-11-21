# The base app of Fastly Hono Compose

A Hono app on Fastly Compute with [Fastly Hono Compose](../../../README.md#fastly-hono-compose). Copy this directory to start an app with plugins, or to try an example of `examples/compose/`.

## Files

| File | |
| --- | --- |
| `src/index.ts` | The app: `buildFire()`, the plugins with `compose()`, and `fire()`. Add your own routes here. |
| `src/plugin-options.js` | The options of each plugin, by the name of the plugin. |
| `hono-compose/` | The plugins. Each file directly in the folder is a plugin, in file-name order. `hello.ts` is a plugin that adds `GET /hello`. |
| `scripts/prebuild.mjs` | Runs before each build: bundles the plugins into `src/hono-compose.generated.js` (and its types), which `src/index.ts` imports. |
| `fastly.toml` | The Fastly Compute package. Its build script is `npm run build`. |

The app has no host, so the plugins have the phases `middleware` and `routes`.

## Commands

```sh
npm install
npm run build    # bundles the plugins, then builds bin/main.wasm
npm start        # fastly compute serve: the app on http://localhost:7676/
npm run deploy   # fastly compute publish
```

`npm start` and `npm run deploy` need the [Fastly CLI](https://www.fastly.com/documentation/reference/tools/cli/).

## A plugin

```ts
// hono-compose/20-hello.ts
import { definePlugin } from '@fastly/hono-fastly-compute/compose';

export default definePlugin({
  routes: (app) => {
    app.get('/hello', (c) => c.text('Hello\n'));
  },
});
```

The folder `hono-compose/` can have its own `package.json` for the packages that the plugins use. Install them in `hono-compose/` with `npm install --legacy-peer-deps <package>`: the app provides `hono`, `@fastly/js-compute`, and `@fastly/hono-fastly-compute`, and the build uses the copies of the app.
