/**
 * The Host services and cross-session event this plugin reads through Cordis.
 *
 * The packages that provide them augment the context at runtime; the plugin is
 * plain JavaScript, so these declarations give `tsc --checkJs` the shape the
 * plugin actually uses without adding a runtime dependency.
 */
import '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** `cordis-plugin-timer`, injected by this plugin. */
    timer: {
      interval(callback: () => void, delay: number): () => void
    }
    /** `dsh-credentials`, injected by this plugin. */
    credentials?: {
      resolve(ref: string): Promise<{ value?: string } | undefined>
    }
    /** Optional installation default, read through `ctx.get`. */
    agentDefaultModel?: {
      currentSelection(): { provider?: string; model?: string } | undefined
    }
    /** Optional Host service behind the DeepSeek account route. */
    deepseekAccount?: {
      getBalance(
        request: Record<string, unknown>,
      ): Promise<
        | {
            status: string
            value?: unknown[]
            bonusWallets?: unknown[]
          }
        | undefined
      >
    }
    /** Optional settings service used for credential discovery. */
    settings?: {
      describe(): Array<{ ns: string; value?: unknown }> | undefined
    }
    /** Optional provider directory used for credential discovery. */
    llm?: {
      listConfigurableProviders(): Array<Record<string, unknown>> | undefined
      /** The routes this installation has configured, with their names. */
      listProviders(): Array<{ id: string; name?: string }> | undefined
    }
    /** Registered by this plugin's own service class. */
    modelAllowance: any
  }

  interface Events {
    'session/event'(session: unknown, event: { type: string }): void
  }
}
