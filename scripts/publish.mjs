#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)

const npmCli = process.env.npm_execpath
if (!npmCli) {
	throw new Error('npm_execpath is not set')
}

function runNpm(commandArgs) {
	execFileSync(process.execPath, [npmCli, ...commandArgs], { stdio: 'inherit' })
}

runNpm(['run', 'build'])
runNpm(['--prefix', 'sdk', 'run', 'build'])

if (args.includes('--dry-run')) {
	runNpm(['pack', '--dry-run'])
	runNpm(['--prefix', 'sdk', 'pack', '--dry-run'])
} else {
	runNpm(['publish', ...args])
	runNpm(['--prefix', 'sdk', 'publish', ...args])
}