/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as pkg from '../../src/index.js';

describe('package entry point', () => {
  it('exports the public runtime API', () => {
    assert.deepEqual(Object.keys(pkg).sort(), [
      'buildFire',
      'fire',
      'getConnInfo',
      'handle',
      'logFastlyServiceVersion',
    ]);
  });
});
