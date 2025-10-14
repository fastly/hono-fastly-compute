/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { env } from 'fastly:env';
import { createMiddleware } from 'hono/factory';

export const logFastlyServiceVersion =
  () => createMiddleware(async (_, next) => {
    console.log('FASTLY_SERVICE_VERSION', env('FASTLY_SERVICE_VERSION'));
    await next();
  });
