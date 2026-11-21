# GRIP example: realtime streams with Fastly Fanout

This example is a [Fastly Hono Compose](../../../README.md#fastly-hono-compose) plugin that adds realtime endpoints to a Hono app on Fastly Compute. A visitor opens a stream, and your backend or your CI publishes messages to it through [Fastly Fanout](https://www.fastly.com/documentation/guides/concepts/real-time-messaging/fanout/). It uses [`@fanoutio/serve-grip`](https://github.com/fanout/js-serve-grip).

## This is an example, not a template

To use it, copy its `hono-compose/` folder into your app, and set it up as this README shows. After you copy it, the code is yours: read it, and change it for your app. It is a starting point, not a supported feature of this package.

The steps:

1. Copy the [base app](../app/) (`examples/compose/app/` in this repository) to a new directory. It is a Hono app with Compose, and a folder `hono-compose/` for the plugins.
2. Replace the `hono-compose/` folder of the app with the `hono-compose/` folder of this example. Then install the packages of the app and of the example:

   ```sh
   rm -rf hono-compose
   cp -R <this repository>/examples/compose/grip/hono-compose hono-compose
   npm install
   cd hono-compose
   npm install --legacy-peer-deps
   ```

   `--legacy-peer-deps` does not install the peer dependencies of the packages of the example (for example `@fastly/js-compute`): the app provides them, and the build uses the copies of the app.
3. Set up the example:
   - the options in `src/plugin-options.js` (see [Options](#options));
   - for local development, the sections of `fastly.toml` in [Local development](#local-development);
   - for Fastly, the steps in [On Fastly](#on-fastly).

To add the example to an app that already has plugins, see [Adding to an existing app](#adding-to-an-existing-app).

## What it does

```
GET  /events/stream/:channel   An HTTP stream. Each message is one line.
GET  /events/sse/:channel      Server-Sent Events, for EventSource in a browser.
POST /publish/:channel         Sends the request body to both endpoints of the channel.
                               Needs the header 'Authorization: Bearer <PUBLISH_KEY>'.
```

The flow of a stream request:

```
GET /events/stream/news  (from the visitor)
  → grip.ts, middleware phase: no Grip-Sig header → hand off to Fanout ─┐
                                                                       │
  ┌────────────────────────────────────────────────────────────────────┘
  ▼
GET /events/stream/news  (from Fanout, with Grip-Sig, through the backend 'self')
  → grip.ts, middleware phase: the signature is correct → c.var.grip
  → grip.ts, routes phase: hold a stream on the channel 'stream:news'
      Fanout keeps the connection to the visitor open, and sends each message.
```

- **One plugin, two phases.** `grip.ts` adds the Fanout handoff and `serveGrip()` in the `middleware` phase, and the three endpoints in the `routes` phase.
- **Only `/events/*` goes through Fanout.** The middleware phase adds the handoff with `app.use('/events/*', …)`, so the other paths of the app do not go through Fanout, and keep the cache. This is the pattern of the Fastly starter kit [`fanout`](https://github.com/fastly/compute-starter-kits/tree/main/starter-kits/javascript/fanout): the app hands off one path, and answers the requests that come back from Fanout itself.
- **The publish endpoint** sends each message two times: to `stream:<channel>` as a line, and to `sse:<channel>` as an SSE event. A request without the correct key gets `401`. If the Secret Store has no `PUBLISH_KEY`, the endpoint gives `503`. You can also publish without this endpoint, with the publish API of Fastly (`POST https://api.fastly.com/service/<service ID>/publish/`, see the [Fanout guide](https://www.fastly.com/documentation/guides/concepts/real-time-messaging/fanout/)).

## Options

In `src/plugin-options.js`, under the name of the plugin, `grip`:

```js
export const pluginOptions = {
  grip: { path: '/events', publishPath: '/publish' },
};
```

| Option | Default | |
| --- | --- | --- |
| `path` | `/events` | The path of the stream endpoints. |
| `publishPath` | `/publish` | The path of the publish endpoint. |

## Secrets

The plugin reads the Secret Store `grip` (the binding `grip: 'SecretStore:grip'`):

| Key | On Fastly | Locally |
| --- | --- | --- |
| `PUBLISH_KEY` | A long random value. Callers of the publish endpoint send it. | Any value. |
| `FANOUT_API_TOKEN` | A Fastly API token that can publish to this service, for the publish endpoint. | Not used. |
| `GRIP_URL` | Not set. The app then uses the publish API of this service, and the public key of Fastly Fanout. | `http://localhost:5561/?verify-iss=viceroy` (Pushpin). |
| `GRIP_VERIFY_KEY` | Not set. | `viceroy_dev_signing_key_dont_use_in_production` |

## Local development

The Fastly CLI can run [Pushpin](https://pushpin.org/), the open-source GRIP proxy that Fanout is based on, next to the local server. Install Pushpin, so that `pushpin` is on your `PATH`. Then add to `fastly.toml`:

```toml
[local_server.pushpin]
enable = true

[local_server.backends.self]
url = "http://localhost:7676/"
override_host = "localhost:7676"

[local_server.secret_stores]
grip = [
  { key = "GRIP_URL", env = "GRIP_URL" },
  { key = "GRIP_VERIFY_KEY", env = "GRIP_VERIFY_KEY" },
  { key = "PUBLISH_KEY", env = "PUBLISH_KEY" },
]
```

The values come from environment variables, so that no secret is in `fastly.toml`:

```sh
export GRIP_URL='http://localhost:5561/?verify-iss=viceroy'
export GRIP_VERIFY_KEY=viceroy_dev_signing_key_dont_use_in_production
export PUBLISH_KEY=local-publish-key
npm start
```

The backend `self` must point at the address of the local server (`localhost:7676` by default). Then, in one terminal:

```sh
curl -N http://localhost:7676/events/stream/test
```

And in another terminal:

```sh
curl -X POST http://localhost:7676/publish/test -H 'Authorization: Bearer local-publish-key' -d 'hello'
```

The first terminal shows `hello`.

In a browser, SSE works with `EventSource`:

```js
const events = new EventSource('/events/sse/test');
events.onmessage = (event) => console.log(event.data);
```

## On Fastly

1. **Turn on Fanout** for the service. For a new service, add these sections to `fastly.toml` before the first `npm run deploy`:

   ```toml
   [setup.products.fanout]
   enable = true

   [setup.backends.self]
   address = "www.example.com"
   port = 443

   [setup.secret_stores.grip.entries.PUBLISH_KEY]
   description = "The key for the publish endpoint"

   [setup.secret_stores.grip.entries.FANOUT_API_TOKEN]
   description = "A Fastly API token that can publish"
   ```

   For a service that exists, run `fastly products --enable=fanout`. This does not need a new version of the service.
2. **Add the backend `self`**, with the domain of the service as the address, port `443`, and TLS. For a service that exists, add it in a new version of the service, and activate that version.
3. **Make the Secret Store `grip`** with `PUBLISH_KEY` and `FANOUT_API_TOKEN`, and link it to the service with the name `grip`.

Then open `https://<your domain>/events/stream/test`, and publish with `POST https://<your domain>/publish/test`.

## Adding to an existing app

Make sure that `hono-compose/` does not already have files with the same names (`grip.ts` and `lib/grip.ts`). The name of a plugin is its file name without the number prefix, and two plugins with the same name stop the build. If the name `grip` is already used, rename the file of the example, and use the new name in the options.

Then copy `grip.ts` and `lib/grip.ts` from the `hono-compose/` folder of this example into your `hono-compose/` folder, in the same places, and install the packages of the example:

```sh
cd hono-compose
npm install --legacy-peer-deps @fanoutio/grip@^4.4.0 @fanoutio/serve-grip@^4.3.0
```

Then do step 3 above.

The plugin uses only the phases `middleware` and `routes`, so it works with every Compose host. For example, in an app of the `hono` template of `@fastly/compute-js-static-publish`, the folder is `hono-compose/` too, the options are in `templateOptions.hono.compose.plugins.grip` of `static-publish.rc.js`, and its routes win over the published files.
