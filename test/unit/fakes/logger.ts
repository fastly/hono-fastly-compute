/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { open } from './registry.js';

export class Logger {
  readonly name: string;
  constructor(name: string) {
    open('Logger', name);
    this.name = name;
  }
}
