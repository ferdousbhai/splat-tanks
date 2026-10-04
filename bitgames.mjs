/**
 * Writes public/bitgames.json: every file in public/ with its SHA-256. BitGames
 * checks these before and after review, so the version children play never changes.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('./public/', import.meta.url))
const SKIP = new Set(['bitgames.json', '_headers', '_redirects'])
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.')) return []
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

const files = {}
for (const file of walk(root).sort()) {
  const path = relative(root, file).split('\\').join('/')
  if (!SKIP.has(path)) files[path] = createHash('sha256').update(readFileSync(file)).digest('hex')
}
writeFileSync(join(root, 'bitgames.json'), JSON.stringify({ files }, null, 2) + '\n')
console.log(`bitgames.json: ${Object.keys(files).length} files`)
