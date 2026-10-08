/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

// Minimal stand-ins for the Fastly Compute FetchEvent and global addEventListener.

type FetchListener = (evt: FetchEvent) => void;

export type FakeFetchEvent = FetchEvent & {
  /** Resolves to whatever was passed to respondWith(); rejects if it was never called. */
  response(): Promise<Response>;
  waitUntilPromises: Promise<unknown>[];
};

export function createFetchEvent(
  request: Request | string = 'http://example.com/',
  { clientAddress = '192.0.2.1', serverAddress = '198.51.100.1' }: {
    clientAddress?: string | null;
    serverAddress?: string;
  } = {},
): FakeFetchEvent {
  let responded: Promise<Response> | undefined;
  const event = {
    request: typeof request === 'string' ? new Request(request) : request,
    client: { address: clientAddress },
    server: { address: serverAddress },
    waitUntilPromises: [] as Promise<unknown>[],
    respondWith(response: Response | PromiseLike<Response>) {
      if (responded != null) {
        throw new Error('respondWith() called more than once');
      }
      responded = Promise.resolve(response);
    },
    waitUntil(promise: Promise<unknown>) {
      this.waitUntilPromises.push(promise);
    },
    response() {
      return responded ?? Promise.reject(new Error('respondWith() was not called'));
    },
  };
  return event as unknown as FakeFetchEvent;
}

/**
 * Replaces globalThis.addEventListener with a recorder for the duration of a test.
 * Call the returned `restore()` when done.
 */
export function captureFetchListeners() {
  const g = globalThis as { addEventListener?: unknown };
  const original = g.addEventListener;
  const listeners: FetchListener[] = [];
  g.addEventListener = (type: string, listener: FetchListener) => {
    if (type !== 'fetch') {
      throw new Error(`unexpected event type: ${type}`);
    }
    listeners.push(listener);
  };
  return {
    listeners,
    async dispatch(request: Request | string) {
      if (listeners.length !== 1) {
        throw new Error(`expected exactly one fetch listener, got ${listeners.length}`);
      }
      const event = createFetchEvent(request);
      listeners[0](event);
      return event.response();
    },
    restore() {
      g.addEventListener = original;
    },
  };
}
