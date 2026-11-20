# OAuth example: log in with GitHub or Google

This example is a [Fastly Hono Compose](../../../README.md#fastly-hono-compose) plugin that puts a login in front of a Hono app on Fastly Compute, or a part of it. Visitors log in with GitHub or Google. It uses [`@hono/oauth-providers`](https://github.com/honojs/middleware/tree/main/packages/oauth-providers), and keeps the login in a signed session cookie.

## This is an example, not a template

To use it, copy its `hono-compose/` folder into your app, and set it up as this README shows. After you copy it, the code is yours: read it, and change it for your app. It is a starting point, not a supported feature of this package. Before you use it for content that must stay private, review it, for example the session length and who can log in.

The steps:

1. Copy the [base app](../app/) (`examples/compose/app/` in this repository) to a new directory. It is a Hono app with Compose, and a folder `hono-compose/` for the plugins.
2. Replace the `hono-compose/` folder of the app with the `hono-compose/` folder of this example. Then install the packages of the app and of the example:

   ```sh
   rm -rf hono-compose
   cp -R <this repository>/examples/compose/oauth/hono-compose hono-compose
   npm install
   cd hono-compose
   npm install --legacy-peer-deps
   ```

   `--legacy-peer-deps` does not install the peer dependencies of the packages of the example (for example `hono`): the app provides them, and the build uses the copies of the app.
3. Make the OAuth apps (see [The OAuth apps](#the-oauth-apps)). Then set up the example:
   - the options in `src/plugin-options.js` (see [Options](#options));
   - for local development, the sections of `fastly.toml` in [Local development](#local-development);
   - for Fastly, the steps in [On Fastly](#on-fastly).
4. Add the routes or the content that the login protects. The base app has only `GET /hello` (the plugin `hono-compose/hello.ts`, which step 2 removed): add your routes in `src/index.ts`, or in other plugins.

To add the example to an app that already has plugins, see [Adding to an existing app](#adding-to-an-existing-app).

## What it does

`10-oauth.ts` is one plugin. All of it is in the `middleware` phase:

```
The login check       On the protect paths (default: all paths), also with a preview prefix.
                      No valid session      → 302 to the login route
                      Not in allowedUsers   → 403
                      Otherwise             → c.var.user, the request continues, and the
                                              response gets 'Cache-Control: private'
The login routes      GET /auth/github      Log in with GitHub (start, and the callback)
                      GET /auth/google      Log in with Google (start, and the callback)
                      GET /auth/logout      Delete the session
```

The flow:

```
GET /private/report        no session → 302 /auth/github (the path is kept in a cookie)
GET /auth/github           → 302 to GitHub
  (the visitor logs in at GitHub)
GET /auth/github?code=…    → the app gets the user from GitHub
                           → sets the session cookie → 302 /private/report
GET /private/report        valid session → the response of the app
```

- The plugin has the prefix `10-`, so it comes before other plugins in each phase. The `middleware` phase of all plugins comes before their other phases, so the login check also protects the routes of other plugins on the protected paths.
- The routes under `/auth/`, and the `login` path, never need a session.
- The login check compares the `protect` paths with the path of the request, and also with the path without a preview prefix: `PREVIEW_PREFIX` in `10-oauth.ts`. Its value is for the previews of [`@fastly/compute-js-static-publish`](https://github.com/fastly/compute-js-static-publish) with the path source `/_preview/{collection}`: thus `/_preview/staging/private/report` needs the same login as `/private/report`. Change it for the previews of your app, or set it to `null` if your app has no previews.
- The session cookie has the user and an expiry time, signed with `SESSION_KEY` (HMAC-SHA256). The app does not store sessions. To log out all visitors, change `SESSION_KEY`.
- A visitor who logs in has two IDs: `id` is `github:<login>` or `google:<email>`, and `accountId` is `github-id:<number>` or `google-id:<number>`, the number of the account at the provider. For Google, only an email address that Google verified is accepted.
- A GitHub user name, or the email address of a Google account, can change, and then someone else can get it. `id` is easy to read, but to allow an account and not a name in `allowedUsers`, use `accountId`. GitHub shows the number of an account at `https://api.github.com/users/<login>` (`id`).

## Options

In `src/plugin-options.js`, under the name of the plugin, `oauth`:

```js
export const pluginOptions = {
  oauth: {
    protect: '/private',
    login: '/auth/github',
    allowedUsers: [ 'github-id:583231', 'google:someone@example.com' ],
    github: { clientId: 'Iv1.0123456789abcdef' },
    google: { clientId: '0123456789-abc.apps.googleusercontent.com' },
    sessionMaxAge: 86400,
  },
};
```

| Option | Default | |
| --- | --- | --- |
| `protect` | `'/'` | The paths that need a login: a path prefix, or a list of them. `'/private'` is `/private` and all paths under it. `'/private/*'` is the same. |
| `login` | `/auth/github` | Where a visitor without a session goes. The login check lets this path through. |
| `allowedUsers` | anyone | The visitors that can log in: the `id` or the `accountId` of each visitor. Without it, any GitHub or Google user can log in. |
| `github.clientId` | | The client ID of your GitHub OAuth app. Without it, `/auth/github` does not exist. |
| `google.clientId` | | The client ID of your Google OAuth client. Without it, `/auth/google` does not exist. |
| `sessionMaxAge` | `86400` | How long a session lasts, in seconds. |

A client ID is not a secret, so it can be in the code of the app.

## Secrets

The plugin reads the Secret Store `oauth` (the binding `oauth: 'SecretStore:oauth'`):

| Key | |
| --- | --- |
| `SESSION_KEY` | A long random value that signs the session cookie. |
| `GITHUB_CLIENT_SECRET` | The client secret of your GitHub OAuth app. |
| `GOOGLE_CLIENT_SECRET` | The client secret of your Google OAuth client. |

If a secret is missing, the login check or the route that needs it gives `503`.

## The OAuth apps

- **GitHub:** make an OAuth app (GitHub → Settings → Developer settings → OAuth Apps). Set the callback URL to `https://<your domain>/auth/github`. For local development, make a second OAuth app with the callback URL `http://localhost:7676/auth/github`.
- **Google:** make an OAuth client of the type "Web application" (Google Cloud console → APIs & Services → Credentials). Add `https://<your domain>/auth/google` and `http://localhost:7676/auth/google` as authorized redirect URIs.

## Local development

Add to `fastly.toml`:

```toml
[local_server.secret_stores]
oauth = [
  { key = "SESSION_KEY", env = "SESSION_KEY" },
  { key = "GITHUB_CLIENT_SECRET", env = "GITHUB_CLIENT_SECRET" },
  { key = "GOOGLE_CLIENT_SECRET", env = "GOOGLE_CLIENT_SECRET" },
]
```

The values come from environment variables, so that no secret is in `fastly.toml`:

```sh
export SESSION_KEY="$(openssl rand -base64 32)"
export GITHUB_CLIENT_SECRET=…
export GOOGLE_CLIENT_SECRET=…
npm start
```

Then open `http://localhost:7676/` in a browser. The cookies have the `Secure` attribute. Many browsers, for example Chrome and Firefox, accept such cookies on `localhost` without HTTPS. If your browser does not, use a local HTTPS proxy, or remove `secure: true` in `lib/session.ts` for local development only.

## On Fastly

1. **Make the Secret Store `oauth`** with the keys above, and link it to the service with the name `oauth`. For a new service, the `setup` section of `fastly.toml` can ask for the values at the first `npm run deploy`:

   ```toml
   [setup.secret_stores.oauth.entries.SESSION_KEY]
   description = "A long random value that signs the session cookie"

   [setup.secret_stores.oauth.entries.GITHUB_CLIENT_SECRET]
   description = "The client secret of the GitHub OAuth app"

   [setup.secret_stores.oauth.entries.GOOGLE_CLIENT_SECRET]
   description = "The client secret of the Google OAuth client"
   ```

2. The login calls GitHub or Google from the app (`fetch()`), with dynamic backends. You do not have to add backends.

## Caching

The login check runs before the routes of the app on each request, so a visitor without a session never gets a protected response from the app. It sets `Cache-Control: private` on the responses of the protected paths, so that a shared cache does not keep them and give them to other visitors. The browser of the visitor can still keep them.

## Adding to an existing app

Make sure that `hono-compose/` does not already have files with the same names (`10-oauth.ts` and `lib/session.ts`). The name of a plugin is its file name without the number prefix, and two plugins with the same name stop the build. If the name `oauth` is already used, rename the file of the example, and use the new name in the options.

Then copy `10-oauth.ts` and `lib/session.ts` from the `hono-compose/` folder of this example into your `hono-compose/` folder, in the same places, and install the packages of the example:

```sh
cd hono-compose
npm install --legacy-peer-deps @hono/oauth-providers@^0.9.1
```

Then do step 3 above.

The plugin uses only the `middleware` phase, so it works with every Compose host. For example, in an app of the `hono` template of `@fastly/compute-js-static-publish`, the folder is `hono-compose/` too, the options are in `templateOptions.hono.compose.plugins.oauth` of `static-publish.rc.js`, and the login check also protects the published files.
