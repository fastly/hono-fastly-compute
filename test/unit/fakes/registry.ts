/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// In-memory stand-in for the resources a Compute service has provisioned.
// Tests populate it; the fake fastly:* modules read from it.

export type ResourceKind = 'Acl' | 'Backend' | 'ConfigStore' | 'KVStore' | 'Logger' | 'SecretStore';

export const registry = {
  resources: new Map<ResourceKind, Set<string>>(),
  env: new Map<string, string>(),
  // Every lookup the fakes receive, so tests can assert on lazy loading and caching.
  calls: [] as { kind: ResourceKind | 'env', name: string }[],
};

export function resetRegistry() {
  registry.resources.clear();
  registry.env.clear();
  registry.calls.length = 0;
}

export function provision(kind: ResourceKind, ...names: string[]) {
  let set = registry.resources.get(kind);
  if (set == null) {
    set = new Set();
    registry.resources.set(kind, set);
  }
  for (const name of names) {
    set.add(name);
  }
}

export function callsFor(kind: ResourceKind | 'env', name?: string) {
  return registry.calls.filter((c) => c.kind === kind && (name === undefined || c.name === name));
}

// Mirrors the runtime: opening a resource that isn't provisioned throws.
export function open(kind: ResourceKind, name: string) {
  registry.calls.push({ kind, name });
  if (!registry.resources.get(kind)?.has(name)) {
    throw new TypeError(`${kind} '${name}' does not exist`);
  }
}
