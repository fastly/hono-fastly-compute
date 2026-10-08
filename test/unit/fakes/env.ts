/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { registry } from './registry.js';

export function env(name: string) {
  registry.calls.push({ kind: 'env', name });
  return registry.env.get(name);
}
