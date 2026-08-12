import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The one database handle. Node ships SQLite, so this costs no dependency and
 * no native build step. DB_FILE lets the tests use ':memory:' so they never
 * touch the real history.
 */
export const DB_FILE =
  process.env.DB_FILE ||
  resolve(dirname(fileURLToPath(import.meta.url)), '../data/calls.db')

if (DB_FILE !== ':memory:') mkdirSync(dirname(DB_FILE), { recursive: true })

export const db = new DatabaseSync(DB_FILE)
