/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { open } from './registry.js';

export class Backend {
  readonly name: string;
  private constructor(name: string) {
    this.name = name;
  }
  static fromName(name: string) {
    open('Backend', name);
    return new Backend(name);
  }
}
