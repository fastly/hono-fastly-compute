/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { open } from './registry.js';

export class ConfigStore {
  readonly name: string;
  constructor(name: string) {
    open('ConfigStore', name);
    this.name = name;
  }
}
