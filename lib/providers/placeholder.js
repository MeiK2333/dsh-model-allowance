/**
 * Placeholder adapters for platforms without balance API support.
 *
 * These adapters declare the routes they serve but return `unsupported` status,
 * indicating that no balance or quota reading is available for these providers.
 * This allows the plugin to recognize the routes without attempting queries
 * that would fail.
 *
 * When a platform adds a balance API, replace its placeholder with a real
 * adapter following the patterns in deepseek.js, minimax_cn.js, or zai.js.
 */

import { defineAdapter, KIND_AMOUNT } from './shared.js'

/**
 * Create a placeholder adapter for a platform without balance support.
 * @param {object} spec Adapter specification.
 * @param {string} spec.id Adapter identity.
 * @param {readonly string[]} spec.routes Provider routes this adapter serves.
 * @param {{zh: string, en: string}} spec.name Display name.
 * @param {string} spec.color Brand color.
 * @param {string} [spec.icon] Optional icon hint.
 * @param {string} [spec.consoleUrl] Provider console URL.
 * @returns {import('../providers.js').ProviderAdapter} The placeholder adapter.
 */
function placeholderAdapter({ id, routes, name, color, icon, consoleUrl }) {
  const safeConsole = typeof consoleUrl === 'string' && consoleUrl.startsWith('https://')
    ? consoleUrl
    : 'https://example.com'

  return defineAdapter({
    id,
    routes,
    kind: KIND_AMOUNT,
    readWithEnv: async ({ route }) => ({
      provider: route,
      status: 'unsupported',
      kind: KIND_AMOUNT,
    }),
    consoleUrl: safeConsole,
    display: {
      name: { zh: name.zh, en: name.en },
      mark: { ...(typeof icon === 'string' ? { icon } : {}), color },
    },
    fixtures: [
      {
        name: 'placeholder returns unsupported',
        services: {},
        expect: { status: 'unsupported', kind: KIND_AMOUNT },
      },
    ],
  })
}

// ============================================================================
// AWS Bedrock
// ============================================================================
export const amazonBedrockAdapters = [
  placeholderAdapter({
    id: 'amazon-bedrock',
    routes: ['amazon-bedrock'],
    name: { zh: 'AWS Bedrock', en: 'AWS Bedrock' },
    color: '#ff9900',
    icon: 'aws',
    consoleUrl: 'https://console.aws.amazon.com/bedrock/',
  }),
]

// ============================================================================
// Ant Ling (蚂蚁灵光)
// ============================================================================
export const antLingAdapters = [
  placeholderAdapter({
    id: 'ant-ling',
    routes: ['ant-ling'],
    name: { zh: '蚂蚁灵光', en: 'Ant Ling' },
    color: '#1677ff',
    icon: 'ant',
    consoleUrl: 'https://www.ant-ling.com/',
  }),
]

// ============================================================================
// Anthropic (Claude)
// ============================================================================
export const anthropicAdapters = [
  placeholderAdapter({
    id: 'anthropic',
    routes: ['anthropic'],
    name: { zh: 'Anthropic (Claude)', en: 'Anthropic (Claude)' },
    color: '#d4a574',
    icon: 'anthropic',
    consoleUrl: 'https://console.anthropic.com/',
  }),
]

// ============================================================================
// Azure OpenAI
// ============================================================================
export const azureAdapters = [
  placeholderAdapter({
    id: 'azure',
    routes: ['azure'],
    name: { zh: 'Azure OpenAI', en: 'Azure OpenAI' },
    color: '#0078d4',
    icon: 'azure',
    consoleUrl: 'https://portal.azure.com/',
  }),
]

// ============================================================================
// Baseten
// ============================================================================
export const basetenAdapters = [
  placeholderAdapter({
    id: 'baseten',
    routes: ['baseten'],
    name: { zh: 'Baseten', en: 'Baseten' },
    color: '#6366f1',
    icon: 'baseten',
    consoleUrl: 'https://app.baseten.co/',
  }),
]

// ============================================================================
// Cerebras
// ============================================================================
export const cerebrasAdapters = [
  placeholderAdapter({
    id: 'cerebras',
    routes: ['cerebras'],
    name: { zh: 'Cerebras', en: 'Cerebras' },
    color: '#f97316',
    icon: 'cerebras',
    consoleUrl: 'https://cloud.cerebras.ai/',
  }),
]

// ============================================================================
// Cloudflare AI Gateway
// ============================================================================
export const cloudflareAiGatewayAdapters = [
  placeholderAdapter({
    id: 'cloudflare-ai-gateway',
    routes: ['cloudflare-ai-gateway'],
    name: { zh: 'Cloudflare AI Gateway', en: 'Cloudflare AI Gateway' },
    color: '#f38020',
    icon: 'cloudflare',
    consoleUrl: 'https://dash.cloudflare.com/',
  }),
]

// ============================================================================
// Cloudflare Workers AI
// ============================================================================
export const cloudflareWorkersAiAdapters = [
  placeholderAdapter({
    id: 'cloudflare-workers-ai',
    routes: ['cloudflare-workers-ai'],
    name: { zh: 'Cloudflare Workers AI', en: 'Cloudflare Workers AI' },
    color: '#f38020',
    icon: 'cloudflare',
    consoleUrl: 'https://dash.cloudflare.com/',
  }),
]

// ============================================================================
// DeepSeek (already implemented in deepseek.js)
// This is just a re-export placeholder for completeness
// ============================================================================
// Note: DeepSeek has full implementation in deepseek.js

// ============================================================================
// Fireworks AI
// ============================================================================
export const fireworksAdapters = [
  placeholderAdapter({
    id: 'fireworks',
    routes: ['fireworks'],
    name: { zh: 'Fireworks AI', en: 'Fireworks AI' },
    color: '#f43f5e',
    icon: 'fireworks',
    consoleUrl: 'https://app.fireworks.ai/',
  }),
]

// ============================================================================
// GitHub Copilot
// ============================================================================
export const githubCopilotAdapters = [
  placeholderAdapter({
    id: 'github-copilot',
    routes: ['github-copilot'],
    name: { zh: 'GitHub Copilot', en: 'GitHub Copilot' },
    color: '#1f2328',
    icon: 'github',
    consoleUrl: 'https://github.com/settings/copilot',
  }),
]

// ============================================================================
// Google (Gemini)
// ============================================================================
export const googleAdapters = [
  placeholderAdapter({
    id: 'google',
    routes: ['google'],
    name: { zh: 'Google (Gemini)', en: 'Google (Gemini)' },
    color: '#4285f4',
    icon: 'google',
    consoleUrl: 'https://aistudio.google.com/',
  }),
]

// ============================================================================
// Google Vertex AI
// ============================================================================
export const googleVertexAdapters = [
  placeholderAdapter({
    id: 'google-vertex',
    routes: ['google-vertex'],
    name: { zh: 'Google Vertex AI', en: 'Google Vertex AI' },
    color: '#4285f4',
    icon: 'google-cloud',
    consoleUrl: 'https://console.cloud.google.com/vertex-ai',
  }),
]

// ============================================================================
// Groq
// ============================================================================
export const groqAdapters = [
  placeholderAdapter({
    id: 'groq',
    routes: ['groq'],
    name: { zh: 'Groq', en: 'Groq' },
    color: '#f55036',
    icon: 'groq',
    consoleUrl: 'https://console.groq.com/',
  }),
]

// ============================================================================
// Hugging Face
// ============================================================================
export const huggingfaceAdapters = [
  placeholderAdapter({
    id: 'huggingface',
    routes: ['huggingface'],
    name: { zh: 'Hugging Face', en: 'Hugging Face' },
    color: '#ffd21e',
    icon: 'huggingface',
    consoleUrl: 'https://huggingface.co/settings/billing',
  }),
]

// ============================================================================
// Kimi Coding (already implemented in kimi_coding.js)
// Note: Kimi Coding has full implementation in kimi_coding.js

// ============================================================================
// Meta (Llama)
// ============================================================================
export const metaAdapters = [
  placeholderAdapter({
    id: 'meta',
    routes: ['meta'],
    name: { zh: 'Meta (Llama)', en: 'Meta (Llama)' },
    color: '#0668e1',
    icon: 'meta',
    consoleUrl: 'https://llama.meta.com/',
  }),
]

// ============================================================================
// MiniMax (International)
// ============================================================================
export const minimaxAdapters = [
  placeholderAdapter({
    id: 'minimax',
    routes: ['minimax'],
    name: { zh: 'MiniMax (国际)', en: 'MiniMax (International)' },
    color: '#e21680',
    icon: 'minimax',
    consoleUrl: 'https://platform.minimax.io/console/usage',
  }),
]

// ============================================================================
// MiniMax CN (already implemented in minimax_cn.js)
// Note: MiniMax CN has full implementation in minimax_cn.js

// ============================================================================
// Mistral AI
// ============================================================================
export const mistralAdapters = [
  placeholderAdapter({
    id: 'mistral',
    routes: ['mistral'],
    name: { zh: 'Mistral AI', en: 'Mistral AI' },
    color: '#f97316',
    icon: 'mistral',
    consoleUrl: 'https://console.mistral.ai/',
  }),
]

// ============================================================================
// Moonshot AI (International)
// ============================================================================
export const moonshotaiAdapters = [
  placeholderAdapter({
    id: 'moonshotai',
    routes: ['moonshotai'],
    name: { zh: 'Moonshot AI (国际)', en: 'Moonshot AI (International)' },
    color: '#636ff6',
    icon: 'moonshot',
    consoleUrl: 'https://platform.moonshot.ai/',
  }),
]

// ============================================================================
// Moonshot AI CN
// ============================================================================
export const moonshotaiCnAdapters = [
  placeholderAdapter({
    id: 'moonshotai-cn',
    routes: ['moonshotai-cn'],
    name: { zh: 'Moonshot AI (国内)', en: 'Moonshot AI (CN)' },
    color: '#636ff6',
    icon: 'moonshot',
    consoleUrl: 'https://platform.moonshot.cn/',
  }),
]

// ============================================================================
// NVIDIA NIM
// ============================================================================
export const nvidiaAdapters = [
  placeholderAdapter({
    id: 'nvidia',
    routes: ['nvidia'],
    name: { zh: 'NVIDIA NIM', en: 'NVIDIA NIM' },
    color: '#76b900',
    icon: 'nvidia',
    consoleUrl: 'https://build.nvidia.com/',
  }),
]

// ============================================================================
// OpenAI
// ============================================================================
export const openaiAdapters = [
  placeholderAdapter({
    id: 'openai',
    routes: ['openai'],
    name: { zh: 'OpenAI', en: 'OpenAI' },
    color: '#10a37f',
    icon: 'openai',
    consoleUrl: 'https://platform.openai.com/usage',
  }),
]

// ============================================================================
// OpenAI Codex
// ============================================================================
export const openaiCodexAdapters = [
  placeholderAdapter({
    id: 'openai-codex',
    routes: ['openai-codex'],
    name: { zh: 'OpenAI Codex', en: 'OpenAI Codex' },
    color: '#10a37f',
    icon: 'openai',
    consoleUrl: 'https://platform.openai.com/',
  }),
]

// ============================================================================
// OpenCode
// ============================================================================
export const opencodeAdapters = [
  placeholderAdapter({
    id: 'opencode',
    routes: ['opencode'],
    name: { zh: 'OpenCode', en: 'OpenCode' },
    color: '#3b82f6',
    icon: 'opencode',
    consoleUrl: 'https://opencode.ai/',
  }),
]

// ============================================================================
// OpenCode Go (already implemented in opencode_go.js)
// Note: OpenCode Go has full implementation in opencode_go.js

// ============================================================================
// OpenRouter
// ============================================================================
export const openrouterAdapters = [
  placeholderAdapter({
    id: 'openrouter',
    routes: ['openrouter'],
    name: { zh: 'OpenRouter', en: 'OpenRouter' },
    color: '#6366f1',
    icon: 'openrouter',
    consoleUrl: 'https://openrouter.ai/activity',
  }),
]

// ============================================================================
// Qwen Token Plan
// ============================================================================
export const qwenTokenPlanAdapters = [
  placeholderAdapter({
    id: 'qwen-token-plan',
    routes: ['qwen-token-plan'],
    name: { zh: '通义千问 Token Plan', en: 'Qwen Token Plan' },
    color: '#ff6a00',
    icon: 'qwen',
    consoleUrl: 'https://platform.qianwenai.com/home/analytics/token-plan/individual',
  }),
]

// ============================================================================
// Qwen Token Plan CN
// ============================================================================
export const qwenTokenPlanCnAdapters = [
  placeholderAdapter({
    id: 'qwen-token-plan-cn',
    routes: ['qwen-token-plan-cn'],
    name: { zh: '通义千问 Token Plan (国内)', en: 'Qwen Token Plan (CN)' },
    color: '#ff6a00',
    icon: 'qwen',
    consoleUrl: 'https://platform.qianwenai.com/home/analytics/token-plan/individual',
  }),
]

// ============================================================================
// Qwen Token Plan Individual
// ============================================================================
export const qwenTokenPlanIndividualAdapters = [
  placeholderAdapter({
    id: 'qwen-token-plan-individual',
    routes: ['qwen-token-plan-individual'],
    name: { zh: '通义千问个人版', en: 'Qwen Token Plan Individual' },
    color: '#ff6a00',
    icon: 'qwen',
    consoleUrl: 'https://platform.qianwenai.com/home/analytics/token-plan/individual',
  }),
]

// ============================================================================
// Radius
// ============================================================================
export const radiusAdapters = [
  placeholderAdapter({
    id: 'radius',
    routes: ['radius'],
    name: { zh: 'Radius', en: 'Radius' },
    color: '#8b5cf6',
    icon: 'radius',
    consoleUrl: 'https://radius.ai/',
  }),
]

// ============================================================================
// Together AI
// ============================================================================
export const togetherAdapters = [
  placeholderAdapter({
    id: 'together',
    routes: ['together'],
    name: { zh: 'Together AI', en: 'Together AI' },
    color: '#0f766e',
    icon: 'together',
    consoleUrl: 'https://api.together.xyz/settings/billing',
  }),
]

// ============================================================================
// TypeSafe
// ============================================================================
export const typesafeAdapters = [
  placeholderAdapter({
    id: 'typesafe',
    routes: ['typesafe'],
    name: { zh: 'TypeSafe', en: 'TypeSafe' },
    color: '#3178c6',
    icon: 'typescript',
    consoleUrl: 'https://typesafe.io/',
  }),
]

// ============================================================================
// Vercel AI Gateway
// ============================================================================
export const vercelAiGatewayAdapters = [
  placeholderAdapter({
    id: 'vercel-ai-gateway',
    routes: ['vercel-ai-gateway'],
    name: { zh: 'Vercel AI Gateway', en: 'Vercel AI Gateway' },
    color: '#000000',
    icon: 'vercel',
    consoleUrl: 'https://vercel.com/dashboard',
  }),
]

// ============================================================================
// xAI (Grok)
// ============================================================================
export const xaiAdapters = [
  placeholderAdapter({
    id: 'xai',
    routes: ['xai'],
    name: { zh: 'xAI (Grok)', en: 'xAI (Grok)' },
    color: '#000000',
    icon: 'xai',
    consoleUrl: 'https://console.x.ai/',
  }),
]

// ============================================================================
// Xiaomi (小米)
// ============================================================================
export const xiaomiAdapters = [
  placeholderAdapter({
    id: 'xiaomi',
    routes: ['xiaomi'],
    name: { zh: '小米', en: 'Xiaomi' },
    color: '#ff6700',
    icon: 'xiaomi',
    consoleUrl: 'https://ai.xiaomi.com/',
  }),
]

// ============================================================================
// Xiaomi Token Plan AMS
// ============================================================================
export const xiaomiTokenPlanAmsAdapters = [
  placeholderAdapter({
    id: 'xiaomi-token-plan-ams',
    routes: ['xiaomi-token-plan-ams'],
    name: { zh: '小米 Token Plan (阿姆斯特丹)', en: 'Xiaomi Token Plan (AMS)' },
    color: '#ff6700',
    icon: 'xiaomi',
    consoleUrl: 'https://ai.xiaomi.com/',
  }),
]

// ============================================================================
// Xiaomi Token Plan CN
// ============================================================================
export const xiaomiTokenPlanCnAdapters = [
  placeholderAdapter({
    id: 'xiaomi-token-plan-cn',
    routes: ['xiaomi-token-plan-cn'],
    name: { zh: '小米 Token Plan (国内)', en: 'Xiaomi Token Plan (CN)' },
    color: '#ff6700',
    icon: 'xiaomi',
    consoleUrl: 'https://ai.xiaomi.com/',
  }),
]

// ============================================================================
// Xiaomi Token Plan SGP
// ============================================================================
export const xiaomiTokenPlanSgpAdapters = [
  placeholderAdapter({
    id: 'xiaomi-token-plan-sgp',
    routes: ['xiaomi-token-plan-sgp'],
    name: { zh: '小米 Token Plan (新加坡)', en: 'Xiaomi Token Plan (SGP)' },
    color: '#ff6700',
    icon: 'xiaomi',
    consoleUrl: 'https://ai.xiaomi.com/',
  }),
]

// ============================================================================
// Zhipu ZAI (already implemented in zai.js)
// Note: Zhipu ZAI has full implementation in zai.js
