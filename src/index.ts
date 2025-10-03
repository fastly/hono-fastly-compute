export * from './fire.js';
export * from './handler.js';
export * from './utils.js';

// Re-export these utilities
export type {
  ResourceType,
  Context,
  ContextProxy,
  BindingsDefs,
} from '@fastly/compute-js-context';
