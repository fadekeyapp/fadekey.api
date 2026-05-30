#!/usr/bin/env node
/**
 * Synchronized version bumper for the FadeKey Open Source repository.
 *
 * Usage:
 *   node scripts/bump-version.mjs patch   → 0.2.0 → 0.2.1
 *   node scripts/bump-version.mjs minor   → 0.2.0 → 0.3.0
 *   node scripts/bump-version.mjs major   → 0.2.0 → 1.0.0
 *
 * Bumps the version in the root package.json (API) and sdk/package.json (SDK)
 * so they stay in sync.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const PACKAGE_PATHS = [
  'package.json',
  'sdk/package.json',
]

const level = process.argv[2]
if (!['patch', 'minor', 'major'].includes(level)) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major>')
  process.exit(1)
}

// Read current version from root package.json
const rootPkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const current = rootPkg.version
const [major, minor, patch] = current.split('.').map(Number)

let next
switch (level) {
  case 'major':
    next = `${major + 1}.0.0`
    break
  case 'minor':
    next = `${major}.${minor + 1}.0`
    break
  case 'patch':
    next = `${major}.${minor}.${patch + 1}`
    break
}

console.log(`\n🔄 Bumping version: ${current} → ${next}\n`)

for (const rel of PACKAGE_PATHS) {
  const abs = resolve(root, rel)
  try {
    const raw = readFileSync(abs, 'utf8')
    const pkg = JSON.parse(raw)
    const old = pkg.version
    pkg.version = next

    // Preserve original formatting (detect indent)
    const indent = raw.match(/^(\s+)"/m)?.[1] ?? '  '
    writeFileSync(abs, JSON.stringify(pkg, null, indent) + '\n', 'utf8')

    console.log(`  ✅ ${rel}  ${old} → ${next}`)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`  ⏭️  ${rel}  (not found, skipping)`)
    } else {
      console.error(`  ❌ ${rel}  ${err.message}`)
    }
  }
}

console.log(`\n✨ Done! All packages are now at version ${next}`)
console.log('   Remember to commit and tag: git tag v' + next + '\n')
