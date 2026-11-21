// The options of each plugin, by the name of the plugin (the file name in
// ../hono-compose/ without the order prefix and the extension). For example:
//
//   export const pluginOptions = {
//     oauth: { protect: '/members', github: { clientId: '…' } },
//   };
//
// src/index.ts gives them to compose(). The build warns about a name that no
// plugin has.
export const pluginOptions = {};
