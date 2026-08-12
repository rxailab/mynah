import express from 'express'
import { renderDoc, DOC_NAMES } from '../legal.js'

/**
 * The published terms, privacy policy and account-deletion instructions.
 *
 * Served from this server rather than a separate site because Google Play
 * requires the privacy policy and the deletion instructions to be reachable at
 * a public URL by anyone — including someone who has not installed the app —
 * and this is the only public URL the project has.
 *
 * No session, no token: these have to work in a browser from a store listing.
 */
export const legal = express.Router()

legal.get('/', (_req, res) => {
  res.redirect('/legal/privacy')
})

legal.get('/:doc', (req, res, next) => {
  const name = String(req.params.doc || '').toLowerCase()
  if (!DOC_NAMES.includes(name)) return next()

  const lang = String(req.query.lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  res
    .type('html')
    // Public and cacheable: nothing here varies by who is asking. Short enough
    // that a corrected policy reaches people the same day.
    .set('Cache-Control', 'public, max-age=3600')
    .send(renderDoc(name, lang))
})
