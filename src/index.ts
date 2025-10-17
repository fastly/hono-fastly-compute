/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

export * from './fire.js';
export * from './handler.js';
export * from './utils.js';
export * from './conninfo.js';

// Re-export these utilities
export type {
  ResourceType,
  Context,
  ContextProxy,
  BindingsDefs,
} from '@fastly/compute-js-context';

declare module 'hono/types' {
  interface FetchEventLike {
    readonly client: ClientInfo;
    readonly server: ServerInfo;
  }
}
