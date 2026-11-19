/**
 * The recorded-transport stub every fixture runner shares.
 *
 * A fixture answers with `responses`, one recorded body per request in order,
 * or with a single `response` for a read that performs one call. Both the
 * endpoint adapters and the `readWithEnv` ones run against this stub, so a
 * fixture never touches the network — including an adapter that performs
 * several calls, such as one console token followed by gateway reads.
 */

/**
 * Stub fetch with one fixture's recorded responses, and record the requests
 * it answered.
 * @param {object} fixture Recorded fixture.
 * @param {() => Promise<object>} run The read to perform.
 * @returns {Promise<{result: object, seen: Array<{url: unknown, init: object}>}>}
 *   The reading and the requests the read made.
 */
export async function withFetch(fixture, run) {
  const original = globalThis.fetch
  const seen = []
  const queue = [...(fixture.responses ?? [])]
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init })
    return {
      ok: (fixture.httpStatus ?? 200) < 400,
      status: fixture.httpStatus ?? 200,
      json: async () => queue.shift() ?? fixture.response ?? {},
    }
  }
  try {
    return { result: await run(), seen }
  } finally {
    globalThis.fetch = original
  }
}
