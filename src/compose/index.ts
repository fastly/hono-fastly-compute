/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// Fastly Hono Compose (@fastly/hono-fastly-compute/compose): a plugin system
// for a Hono app on Fastly Compute. Each plugin is a module in a folder that
// default-exports definePlugin(…). A host gives the list of steps of the app:
// the phases, where the plugins add their code, and the steps of the host
// itself. compose() runs the list.
//
// This module imports only types, so that the unit tests can import it.

import type { Hono } from 'hono';
import type { BindingsDefs } from '@fastly/compute-js-context';

import type { BindingsWithClientInfo } from '../handler.js';

// The marker in a list of steps for the phases that every app has:
// 'middleware', then 'routes'.
export const CORE_PHASES: unique symbol = Symbol('CORE_PHASES');

// The phases that CORE_PHASES stands for, in this order.
const CORE_PHASE_NAMES = [ 'middleware', 'routes' ] as const;
export type CorePhaseName = typeof CORE_PHASE_NAMES[number];

// --- Hosts

// The function of a host step. It gets the app and the helpers of the host.
export type HostStepFunction<H = any> = (app: Hono<any, any, any>, helpers: H) => void;

// An entry in the list of steps of a host:
// - CORE_PHASES: the phases 'middleware' and 'routes';
// - a string: a phase of the host, where the plugins add their code;
// - [ name, fn ]: a step of the host, which runs fn.
export type StepEntry<H = any> = typeof CORE_PHASES | string | readonly [ string, HostStepFunction<H> ];

// The phases of a list of steps.
export type PhasesOf<S extends readonly StepEntry<any>[]> =
  | Extract<S[number], string>
  | (typeof CORE_PHASES extends S[number] ? CorePhaseName : never);

// One step of a host, after defineComposeHost() checked the list.
export type HostStep<H = any> =
  | { kind: 'phase', name: string }
  | { kind: 'step', name: string, fn: HostStepFunction<H> };

export type ComposeHost<P extends string = string, H = any> = {
  kind: 'compose-host',
  // The steps, in order. CORE_PHASES is two phases here.
  steps: readonly HostStep<H>[],
  // The names of the phases, in order.
  phases: readonly P[],
  helpers: H,
};

export type DefineComposeHostOptions<S extends readonly StepEntry<H>[], H> = {
  // The list of steps. It must have CORE_PHASES exactly once.
  steps: S,
  // The helpers that each phase function of a plugin and each host step gets.
  helpers?: H,
};

const isStepTuple = (entry: unknown): entry is readonly [ string, HostStepFunction ] =>
  Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'function';

// Checks a list of steps, and makes a host. Throws if the list does not have
// CORE_PHASES exactly once, if a name is not a non-empty string, if two names
// are the same, or if an entry is not CORE_PHASES, a string, or [ name, fn ].
// Call it at the top level of the app, so that an error stops the build.
export function defineComposeHost<const S extends readonly StepEntry<H>[], H = {}>(
  options: DefineComposeHostOptions<S, H>,
): ComposeHost<PhasesOf<S>, H> {
  const entries = options.steps as readonly unknown[];
  if (!Array.isArray(entries)) {
    throw new Error('defineComposeHost(): steps must be an array.');
  }
  const coreCount = entries.filter(entry => entry === CORE_PHASES).length;
  if (coreCount !== 1) {
    throw new Error(`defineComposeHost(): the steps must have CORE_PHASES exactly once, but have it ${coreCount} times.`);
  }

  const steps: HostStep<H>[] = [];
  for (const [ index, entry ] of entries.entries()) {
    if (entry === CORE_PHASES) {
      for (const name of CORE_PHASE_NAMES) {
        steps.push({ kind: 'phase', name });
      }
    } else if (typeof entry === 'string') {
      steps.push({ kind: 'phase', name: entry });
    } else if (isStepTuple(entry)) {
      steps.push({ kind: 'step', name: entry[0], fn: entry[1] });
    } else {
      throw new Error(`defineComposeHost(): steps[${index}] must be CORE_PHASES, the name of a phase, or [ name, fn ].`);
    }
  }

  const seen = new Set<string>();
  for (const step of steps) {
    if (step.name === '') {
      throw new Error('defineComposeHost(): the name of a step must not be empty.');
    }
    if (seen.has(step.name)) {
      throw new Error(`defineComposeHost(): the name '${step.name}' is in the steps more than once.`);
    }
    seen.add(step.name);
  }

  return {
    kind: 'compose-host',
    steps,
    phases: steps.filter(step => step.kind === 'phase').map(step => step.name) as PhasesOf<S>[],
    helpers: options.helpers ?? ({} as H),
  };
}

// The host of an app that does not give one: CORE_PHASES only, no helpers.
const DEFAULT_HOST = defineComposeHost({ steps: [ CORE_PHASES ] });

// --- The registered host, for the types of the plugins

// An app registers its host here, so that each plugin gets the names of its
// phases and the type of its helpers:
//
//   declare module '@fastly/hono-fastly-compute/compose' {
//     interface ComposeHostRegistry { host: typeof host }
//   }
//
// Without a registered host, a plugin has the phases 'middleware' and
// 'routes', and no helpers.
export interface ComposeHostRegistry {}

type RegisteredHost = ComposeHostRegistry extends { host: infer X } ? X : typeof DEFAULT_HOST;

// The names of the phases of the registered host.
export type PhaseName = RegisteredHost extends ComposeHost<infer P, any> ? P : CorePhaseName;

// The helpers of the registered host.
export type PluginHelpers = RegisteredHost extends ComposeHost<any, infer H> ? H : {};

// --- Plugins

// The bindings that a plugin uses on c.env: the name on c.env, and the
// resource, for example { config: 'ConfigStore:site_config' }.
export type PluginBindings = BindingsDefs;

// The Env of the app that a plugin gets: its bindings on c.env. c.var is not
// typed, so that a plugin can set its own variables.
export type PluginEnv<B extends PluginBindings = {}> = {
  Bindings: BindingsWithClientInfo<B>,
  Variables: Record<string, any>,
};

// A function that adds the handlers of a plugin to the app, in one phase.
// options is the value for this plugin in the pluginOptions of compose().
export type PluginPhaseFunction<B extends PluginBindings = {}, O = any> =
  (app: Hono<PluginEnv<B>, any, any>, options: O | undefined, helpers: PluginHelpers) => void;

export type PluginPhases<B extends PluginBindings = {}, O = any> = {
  [P in PhaseName]?: PluginPhaseFunction<B, O>
};

export type DefinePluginOptions<B extends PluginBindings = {}> = {
  // The bindings that the plugin uses on c.env.
  bindings?: B,
};

export type Plugin = {
  kind: 'plugin',
  bindings: PluginBindings,
  // The function of each phase. compose() checks the names.
  phases: Record<string, unknown>,
};

// An entry of the list of plugins that the build writes (see
// @fastly/hono-fastly-compute/compose/build).
export type PluginEntry = {
  // The name of the plugin: the file name without the order prefix and the
  // extension. It is the key in the pluginOptions of compose().
  name: string,
  // The file, for messages: the name of the folder and the name of the file,
  // for example 'hono-compose/10-auth.ts'.
  file: string,
  // The default export of the file.
  plugin: Plugin,
};

// A function adds handlers in the middleware phase. An object has a function
// for each phase that the plugin uses.
export function definePlugin<O = any>(phases: PluginPhaseFunction<{}, O> | PluginPhases<{}, O>): Plugin;
export function definePlugin<const B extends PluginBindings, O = any>(options: DefinePluginOptions<B>, phases: PluginPhaseFunction<B, O> | PluginPhases<B, O>): Plugin;
export function definePlugin(
  optionsOrPhases: DefinePluginOptions<any> | PluginPhaseFunction<any> | PluginPhases<any>,
  phases?: PluginPhaseFunction<any> | PluginPhases<any>,
): Plugin {
  const [ options, value ] = phases === undefined ?
    [ {}, optionsOrPhases as PluginPhaseFunction<any> | PluginPhases<any> ] :
    [ optionsOrPhases as DefinePluginOptions<any>, phases ];
  return {
    kind: 'plugin',
    bindings: { ...options.bindings },
    phases: typeof value === 'function' ? { middleware: value } : { ...value },
  };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value != null && !Array.isArray(value);

const quoteList = (names: readonly string[]) => names.map(name => `'${name}'`).join(', ');

// Checks that the default export of a file is definePlugin(…). With phases,
// also checks that the plugin has a function for one or more of them, and no
// other keys. Throws an error that names the file.
function checkPlugin(entry: PluginEntry, phases?: readonly string[]): Plugin {
  const plugin = entry.plugin as Partial<Plugin> | undefined;
  if (plugin == null || plugin.kind !== 'plugin') {
    throw new Error(`${entry.file}: the default export must be definePlugin(…).`);
  }
  if (phases == null) {
    return plugin as Plugin;
  }
  const value = plugin.phases;
  const keys = isPlainObject(value) ? Object.keys(value) : [];
  const unknown = keys.filter(key => !phases.includes(key));
  if (!isPlainObject(value) || keys.length === 0 || unknown.length > 0) {
    throw new Error(
      `${entry.file}: definePlugin() needs a function, or an object with a function ` +
      `for one or more of the phases ${phases.join(', ')}.` +
      (unknown.length === 1 ? ` '${unknown[0]}' is not a phase of this app.` : '') +
      (unknown.length > 1 ? ` ${quoteList(unknown)} are not phases of this app.` : ''),
    );
  }
  for (const key of keys) {
    if (typeof value[key] !== 'function') {
      throw new Error(`${entry.file}: the phase ${key} must be a function.`);
    }
  }
  return plugin as Plugin;
}

// --- Bindings

export type MergeBindingsOptions = {
  // The name of the bindings of the app in messages. Default: 'the bindings of the app'.
  appBindingsSource?: string,
};

// Merges the bindings of the app with the bindings of the plugins, for
// buildFire(). The same name with the same resource is allowed. Throws for a
// file that does not default-export definePlugin(…), or for one name with two
// different resources; the message names the sources. Call it at the top level
// of the app, so that an error stops the build.
export function mergeBindings(
  appBindings: PluginBindings | undefined,
  plugins: readonly PluginEntry[],
  options: MergeBindingsOptions = {},
): PluginBindings {
  // Maps, so that a binding name such as 'toString' is not found on
  // Object.prototype.
  const merged = new Map<string, string>();
  const sourceOf = new Map<string, string>();

  const add = (bindings: Record<string, string>, source: string) => {
    for (const [ name, resource ] of Object.entries(bindings)) {
      const existing = merged.get(name);
      if (existing != null && existing !== resource) {
        throw new Error(
          `The binding '${name}' is '${existing}' in ${sourceOf.get(name)}, ` +
          `but '${resource}' in ${source}. Use the same resource, or another name.`,
        );
      }
      merged.set(name, resource);
      if (!sourceOf.has(name)) {
        sourceOf.set(name, source);
      }
    }
  };

  add(appBindings ?? {}, options.appBindingsSource ?? 'the bindings of the app');
  for (const entry of plugins) {
    add(checkPlugin(entry).bindings ?? {}, entry.file);
  }
  return Object.fromEntries(merged) as PluginBindings;
}

// --- compose()

export type ComposeOptions = {
  // The host. Default: CORE_PHASES only, with no helpers.
  host?: ComposeHost<string, any>,
  // The options of each plugin, by the name of the plugin.
  pluginOptions?: Record<string, unknown>,
};

// Runs the list of steps of the host on the app: for each phase, the function
// of that phase of each plugin, in the order of the list of plugins; for each
// host step, its function. Throws for a file that does not default-export
// definePlugin(…), or for a plugin with a phase that the host does not have.
// Call it at the top level of the app, so that an error stops the build.
export function compose(app: Hono<any, any, any>, plugins: readonly PluginEntry[], options: ComposeOptions = {}): void {
  const host = options.host ?? DEFAULT_HOST;
  if (host.kind !== 'compose-host') {
    throw new Error('compose(): host must be the value of defineComposeHost().');
  }
  const checked = plugins.map(entry => ({ entry, plugin: checkPlugin(entry, host.phases) }));
  const optionsOf = (name: string) =>
    options.pluginOptions != null && Object.prototype.hasOwnProperty.call(options.pluginOptions, name) ?
      options.pluginOptions[name] :
      undefined;

  for (const step of host.steps) {
    if (step.kind === 'step') {
      step.fn(app, host.helpers);
      continue;
    }
    for (const { entry, plugin } of checked) {
      const fn = plugin.phases[step.name] as PluginPhaseFunction | undefined;
      fn?.(app, optionsOf(entry.name), host.helpers);
    }
  }
}
