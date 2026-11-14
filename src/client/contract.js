import * as z from 'zod'

/**
 * Build the client contribution for the `balance` namespace.
 *
 * The Host publishes the namespace through `@Remote` markers on its live
 * service. The browser needs a matching descriptor to mount it, so this
 * hand-authors the contract the Typert build pipeline would generate: one
 * strict codec per parameter and per result. The Host answers in the source
 * mode, so the parameter names must match the Host method's own parameter
 * names. `test/contract.test.mjs` validates the result schema against every
 * recorded provider fixture.
 *
 * @returns {{package: string, methods: Record<string, object>}} The contribution.
 */
export function createBalanceContribution() {
  const providerSchema = z.string().min(1)
  const windowSchema = z.object({
    id: z.string(),
    unit: z.enum(['hour', 'day', 'week', 'month', 'unknown']),
    label: z.object({ zh: z.string().optional(), en: z.string().optional() }).optional(),
    count: z.number().optional(),
    used: z.number().optional(),
    total: z.number().optional(),
    remainingPercent: z.number().optional(),
    resetAt: z.number().optional(),
  })
  const balanceViewSchema = z.object({
    provider: z.string(),
    status: z.enum(['ready', 'unsupported', 'unconfigured', 'failed']),
    kind: z.enum(['amount', 'quota']).optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    remaining: z.number().optional(),
    total: z.number().optional(),
    percent: z.number().optional(),
    remainingMs: z.number().optional(),
    resetsAt: z.number().optional(),
    windows: z.array(windowSchema).optional(),
    // A reading that moved since the last one carries the movement; the
    // badge renders it for a few seconds. Omitting it here would make a
    // stricter result codec strip the very field the badge reads.
    consumption: z
      .object({
        kind: z.enum(['amount', 'percent']),
        delta: z.number(),
        at: z.number(),
      })
      .optional(),
    consoleUrl: z.string().optional(),
    updatedAt: z.number().optional(),
    error: z.string().optional(),
  })
  const balanceStatusSchema = z.object({
    provider: z.string(),
    state: z.enum([
      'operational',
      'degraded',
      'partial-outage',
      'major-outage',
      'maintenance',
      'unknown',
    ]),
    summary: z.string().optional(),
    url: z.string().optional(),
    updatedAt: z.number().optional(),
    error: z.string().optional(),
  })
  const scheduleSchema = z
    .object({
      provider: z.string(),
      timezone: z.string(),
      timezoneLabel: z.object({ zh: z.string().optional(), en: z.string().optional() }),
      days: z.array(z.number()),
      windows: z.array(z.object({ from: z.string(), to: z.string() })),
      holidays: z.array(z.string()).optional(),
      note: z.object({ zh: z.string().optional(), en: z.string().optional() }).optional(),
    })
    .nullable()
  /** A strict codec carries the Zod factory the gateway validates with. */
  const strict = (schema, description, typeSymbol) => ({
    mode: 'strict',
    typeSymbol,
    create: () => schema,
    jsonSchema: { type: 'object' },
    description,
  })
  const providerParameter = {
    name: 'provider',
    wire: 'provider',
    source: 'json',
    codec: strict(providerSchema, 'Provider route to read.', 'dsh-model-allowance#provider'),
  }
  // The session's provider-owned model id. MiniMax meters each model bucket
  // separately, so the Host needs it to pick the right plan; a route the
  // card was pointed at has no model context and leaves it undefined.
  const modelParameter = {
    name: 'model',
    wire: 'model',
    source: 'json',
    acceptsUndefined: true,
    codec: strict(
      z.string().nullable().optional(),
      'Provider-owned model id, when the session names one.',
      'dsh-model-allowance#model',
    ),
  }
  // A provider entry carries what the browser needs to name and draw the
  // route. Every added field is optional, so an older Host still answers.
  const providerListSchema = z.array(
    z.object({
      route: z.string(),
      configured: z.boolean(),
      name: z.object({ zh: z.string().optional(), en: z.string().optional() }).optional(),
      color: z.string().optional(),
      iconHint: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      modelRoutes: z.array(z.string()).optional(),
    }),
  )
  return {
    package: 'dsh-model-allowance',
    methods: {
      'balance/list': {
        service: 'balanceController',
        description: 'List the provider routes this installation can read.',
        invocation: { kind: 'direct' },
        parameters: [],
        result: strict(providerListSchema, 'The routes.', 'dsh-model-allowance#routes'),
      },
      'balance/capabilities': {
        service: 'balanceController',
        description: 'The wire capabilities this Host supports.',
        invocation: { kind: 'direct' },
        parameters: [],
        result: strict(
          z.object({ modelScoped: z.boolean() }),
          'The capabilities.',
          'dsh-model-allowance#capabilities',
        ),
      },
      'balance/balance': {
        service: 'balanceController',
        description: "Read one provider's balance or remaining allowance.",
        invocation: { kind: 'direct' },
        parameters: [providerParameter, modelParameter],
        result: strict(balanceViewSchema, 'The reading.', 'dsh-model-allowance#balanceView'),
      },
      'balance/defaultProvider': {
        service: 'balanceController',
        description: 'The provider a session with no model selection would use.',
        invocation: { kind: 'direct' },
        parameters: [],
        result: strict(
          z.object({ provider: z.string().optional() }),
          'The default provider.',
          'dsh-model-allowance#defaultProvider',
        ),
      },
      'balance/refresh': {
        service: 'balanceController',
        description: 'Force a fresh reading for one provider, bypassing the cache.',
        invocation: { kind: 'direct' },
        parameters: [providerParameter, modelParameter],
        result: strict(balanceViewSchema, 'The reading.', 'dsh-model-allowance#balanceView'),
      },
      'balance/watch': {
        service: 'balanceController',
        description: 'Stream readings for one provider until the stream ends.',
        mode: 'stream',
        invocation: { kind: 'direct' },
        parameters: [providerParameter, modelParameter],
        cancellation: { parameter: 'signal' },
        result: strict(balanceViewSchema, 'One reading.', 'dsh-model-allowance#balanceView'),
      },
      'balance/status': {
        service: 'balanceController',
        description: "Read one provider's platform status.",
        invocation: { kind: 'direct' },
        parameters: [providerParameter],
        result: strict(
          balanceStatusSchema,
          'The status reading.',
          'dsh-model-allowance#balanceStatus',
        ),
      },
      'balance/schedule': {
        service: 'balanceController',
        description: 'The time-of-day pricing schedule for one provider, when it has one.',
        invocation: { kind: 'direct' },
        parameters: [providerParameter],
        result: strict(scheduleSchema, 'The schedule, or null.', 'dsh-model-allowance#schedule'),
      },
    },
  }
}
