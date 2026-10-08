/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The @fastly/js-compute versions the integration tests build and run against:
// the minimum supported 3.x, the latest 3.x, and the latest 4.x.
// Pinned so that runs are reproducible; bump them when new SDK versions ship.
// Set SDK_VERSIONS (comma-separated versions or ranges) to override, e.g. SDK_VERSIONS="^3,^4".
const DEFAULT_SDK_VERSIONS = ['3.33.0', '3.46.0', '4.0.0'];

export const SDK_VERSIONS = (process.env.SDK_VERSIONS?.split(',') ?? DEFAULT_SDK_VERSIONS)
  .map((version) => version.trim())
  .filter((version) => version !== '');

// Scratch directory for the packed tarball and per-SDK app builds (gitignored).
export const WORK_DIR = join(dirname(fileURLToPath(import.meta.url)), '.work');

// Where the app for an SDK version is installed and built.
export function sdkWorkDir(version) {
  return join(WORK_DIR, `sdk-${version.replace(/[^\w.]/g, '_')}`);
}
