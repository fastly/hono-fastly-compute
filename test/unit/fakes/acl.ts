/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { open } from './registry.js';

export class Acl {
  readonly name: string;
  private constructor(name: string) {
    this.name = name;
  }
  static open(name: string) {
    open('Acl', name);
    return new Acl(name);
  }
}
