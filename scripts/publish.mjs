#!/usr/bin/env node

import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)

const npmCli = process.env.npm_execpath
if (!npmCli) {
	throw new Error('npm_execpath is not set')
}

function runNpm(commandArgs, cwd) {
	execFileSync(process.execPath, [npmCli, ...commandArgs], { stdio: 'inherit', cwd })
}

runNpm(['run', 'build'])
runNpm(['run', 'build'], 'sdk')

if (args.includes('--dry-run')) {
	runNpm(['pack', '--dry-run'])
	runNpm(['pack', '--dry-run'], 'sdk')
} else {
	runNpm(['publish', ...args])
	runNpm(['publish', ...args], 'sdk')
}