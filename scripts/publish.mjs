#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)

const npmCli = process.env.npm_execpath
if (!npmCli) {
	throw new Error('npm_execpath is not set')
}

function runNpm(commandArgs, cwd) {
	execFileSync(process.execPath, [npmCli, ...commandArgs], { stdio: 'inherit', cwd })
}

function getPackageInfo(cwd) {
	const path = cwd ? join(cwd, 'package.json') : 'package.json'
	const pkg = JSON.parse(readFileSync(path, 'utf8'))
	return { name: pkg.name, version: pkg.version }
}

function isAlreadyPublished(packageName, version) {
	try {
		const result = execFileSync(
			process.execPath,
			[npmCli, 'view', `${packageName}@${version}`, 'version'],
			{ stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
		).trim()
		return result === version
	} catch {
		return false
	}
}

runNpm(['run', 'build'])
runNpm(['run', 'build'], 'sdk')

if (args.includes('--dry-run')) {
	runNpm(['pack', '--dry-run'])
	runNpm(['pack', '--dry-run'], 'sdk')
} else {
	// Publish root package
	const rootPkg = getPackageInfo()
	if (isAlreadyPublished(rootPkg.name, rootPkg.version)) {
		console.log(`[publish] Package ${rootPkg.name}@${rootPkg.version} is already published. Skipping.`)
	} else {
		console.log(`[publish] Publishing ${rootPkg.name}@${rootPkg.version}...`)
		runNpm(['publish', ...args])
	}

	// Publish sdk package
	const sdkPkg = getPackageInfo('sdk')
	if (isAlreadyPublished(sdkPkg.name, sdkPkg.version)) {
		console.log(`[publish] Package ${sdkPkg.name}@${sdkPkg.version} is already published. Skipping.`)
	} else {
		console.log(`[publish] Publishing ${sdkPkg.name}@${sdkPkg.version}...`)
		runNpm(['publish', ...args], 'sdk')
	}
}