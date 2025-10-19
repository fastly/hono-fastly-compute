# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [unreleased]

### Added

- Within `fire()`, run a dummy `match()` against the router, forcing it to build any caches during the pre-wizer step.

## [0.3.5] - 2025-10-19

### Fixed

- Fixed incorrect type on FireFn overload

## [0.3.4] - 2025-10-17

### Added

- Improve `executionCtx` and `event` integration

## [0.3.3] - 2025-10-15

### Changed

- Change debugging definition field to `_defs`

### Added

- Expose default `fire` and `Bindings`

## [0.3.2] - 2025-10-14

### Added

- Extend env with client and server info
- Implement ConnInfo helpers

## [0.3.1] - 2025-10-08

### Fixed

- Fix typings when bindings are empty

## [0.3.0] - 2025-10-06

### Changed

- Moved to `@fastly` scope

## [0.1.0] - 2025-10-03

### Added

- Initial public release

[unreleased]: https://github.com/fastly/hono-fastly-compute/compare/v0.3.5...HEAD
[0.3.5]: https://github.com/fastly/hono-fastly-compute/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/fastly/hono-fastly-compute/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/fastly/hono-fastly-compute/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/fastly/hono-fastly-compute/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/fastly/hono-fastly-compute/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/fastly/hono-fastly-compute/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/fastly/hono-fastly-compute/releases/tag/v0.1.0
