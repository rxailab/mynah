/**
 * Lists the models your Runware key can reach.
 *   npm run models
 */
import OpenAI from 'openai'
import { config } from '../src/config.js'

if (!config.runwareApiKey) {
  console.error('Set RUNWARE_API_KEY in server/.env first.')
  process.exit(1)
}

const client = new OpenAI({ apiKey: config.runwareApiKey, baseURL: config.runwareBaseUrl })

try {
  const { data } = await client.models.list()
  const ids = data.map((m) => m.id).sort()
  console.log(`${ids.length} models available via ${config.runwareBaseUrl}\n`)
  for (const id of ids) {
    console.log(`  ${id}${id === config.model ? '   <- currently selected' : ''}`)
  }
  console.log('\nSet LLM_MODEL in server/.env to switch.')
} catch (err) {
  console.error(`Could not list models: ${err.message}`)
  process.exit(1)
}
