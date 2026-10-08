/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { open } from './registry.js';

export class KVStore {
  readonly name: string;
  constructor(name: string) {
    open('KVStore', name);
    this.name = name;
  }
}
