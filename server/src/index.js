import http from 'node:http'
import express from 'express'
import { WebSocketServer } from 'ws'

import { assertConfig, config } from './config.js'
import { log } from './log.js'
import { api } from './routes/api.js'
import { auth } from './routes/auth.js'
import { legal } from './routes/legal.js'
import { pay } from './routes/pay.js'
import { stripeWebhook } from './routes/stripeWebhook.js'
import { twilioStatus } from './routes/twilioStatus.js'
import { userForSession } from './accounts.js'
import { handleRelayConnection } from './relay/session.js'
import { bus, detail, getCall } from './store.js'
import { startCostPoller } from './twilio/costs.js'
import { startScheduler } from './scheduled.js'
import { startTranscriptTranslation } from './agent/translate.js'

assertConfig()
startCostPoller()
startScheduler()
startTranscriptTranslation()

const app = express()

// Ahead of the JSON parser, and it has to stay there. Stripe signs the exact
// bytes it sent, so the webhook needs the raw body; once express.json() has
// read the stream there is no way back to it, and every signature check fails.
app.use('/stripe', stripeWebhook)

app.use(express.json({ limit: '256kb' }))

app.get('/health', (_req, res) => res.json({ ok: true }))
// Public and unauthenticated: a store listing links straight here.
app.use('/legal', legal)
// Also public, and deliberately so — the person paying is not always the
// person with the account. The link is the credential; see routes/pay.js.
app.use('/pay', pay)
app.use('/api/auth', auth)
app.use('/api', api)
app.use('/twilio', twilioStatus)

app.use((err, _req, res, _next) => {
  log.error('server', 'unhandled error in a request', err)
  if (!res.headersSent) res.status(500).json({ error: 'The server hit an unexpected error.' })
})

const server = http.createServer(app)

const relayWss = new WebSocketServer({ noServer: true })
const appWss = new WebSocketServer({ noServer: true })

relayWss.on('connection', (ws, _req, callId) => handleRelayConnection(ws, callId))

/** Live feed for the Android app: one socket per call it is watching. */
appWss.on('connection', (ws, _req, callId, userId) => {
  const call = getCall(callId)
  // Same rule as the REST side: a call you did not place is a call that does
  // not exist as far as you are concerned.
  if (!call || call.userId !== userId) {
    ws.close(1008, 'No such call.')
    return
  }

  ws.send(JSON.stringify({ type: 'snapshot', call: detail(call) }))

  const forward = (event) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event))
  }
  bus.on(callId, forward)

  const keepAlive = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping()
  }, 25000)

  ws.on('close', () => {
    bus.off(callId, forward)
    clearInterval(keepAlive)
  })
})

server.on('upgrade', (req, socket, head) => {
  let url
  try {
    url = new URL(req.url, `https://${config.publicHost}`)
  } catch {
    return socket.destroy()
  }

  const callId = url.searchParams.get('ref') || ''

  if (url.pathname === '/relay') {
    // Authenticated by the unguessable per-call id, which only ever travels
    // from this server to Twilio over TLS.
    relayWss.handleUpgrade(req, socket, head, (ws) => relayWss.emit('connection', ws, req, callId))
    return
  }

  if (url.pathname === '/app') {
    const user = userForSession(url.searchParams.get('token'))
    if (!user) {
      // Written by hand: there is no ws server to hand an unauthorised upgrade
      // to. Content-Length makes it a complete message rather than one whose
      // end is implied by the close, and end() flushes before the FIN. Without
      // both, destroy() can cut the response short, and a proxy in front — the
      // Cloudflare tunnel this runs behind — reports the truncation upstream as
      // a 502, so the app sees a network fault where it should see "sign in
      // again".
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      return
    }
    appWss.handleUpgrade(req, socket, head, (ws) =>
      appWss.emit('connection', ws, req, callId, user.id))
    return
  }

  socket.destroy()
})

/**
 * A failed bind has to be fatal.
 *
 * Without this the uncaughtException handler below — which exists so one bad
 * request cannot drop a live call — swallows EADDRINUSE and leaves the process
 * running with no listener. A test harness that starts its own server then
 * quietly talks to whichever copy already owns the port, against whichever
 * database that copy opened. That has happened; hence this.
 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log.error('server', `port ${config.port} is already in use — another copy is running`)
    process.exit(1)
  }
  throw err
})

server.listen(config.port, () => {
  log.info('server', `listening on :${config.port}`)
  log.info('server', `Twilio will connect to wss://${config.publicHost}/relay`)
  log.info('server', `model ${config.model} via ${config.runwareBaseUrl}`)
  if (config.recordCalls) log.warn('server', 'RECORD_CALLS is on — check consent rules before using this')
})

// This process may be holding several live phone calls. Dying because of one
// stray rejection would drop all of them, so log loudly and keep serving —
// a wedged request is recoverable, a dead server mid-call is not.
process.on('unhandledRejection', (reason) => {
  log.error('server', 'unhandled promise rejection (staying up)', reason)
})
process.on('uncaughtException', (err) => {
  log.error('server', 'uncaught exception (staying up)', err)
})

const shutdown = () => {
  log.info('server', 'shutting down')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
