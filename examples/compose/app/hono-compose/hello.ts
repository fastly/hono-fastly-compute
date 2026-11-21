// A plugin: the routes phase adds GET /hello. Replace this folder with the
// hono-compose/ folder of an example, or add your own plugins.
import { definePlugin } from '@fastly/hono-fastly-compute/compose';

export default definePlugin({
  routes: (app) => {
    app.get('/hello', (c) => c.text('Hello from a Compose plugin.\n'));
  },
});
