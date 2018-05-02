#!/usr/bin/env node
'use strict'
const BbPromise = require('bluebird')
const fs = BbPromise.promisifyAll(require('fs'))
const path = require('path')
const vm = require('vm')
const esprima = require('esprima')
const _ = require('lodash')
const chalk = require('chalk')

const fsutil = require('./lib/fsutil')
const VisitorContext = require('./lib/visitors').VisitorContext
const unpacker = require('./lib/unpacker')
const ModuleFinder = require('./lib/ModuleFinder')

const argv = process.argv.slice(2)

if (require.main === module) {
  main().then().catch(e => console.error('Error!!!', e))
}

async function main () {
  try {
    await unpackFile(...argv)
  } catch (err) {
    console.log('The following error occurred:' + err.toString())
  }
}

function prepareOutDir (file, outDir) {
  if (!file) {
    help('File to process must be provided as the first argument.')
    return 1
  }
  if (!outDir) {
    outDir = path.resolve(path.dirname(file))
  }
  // entire contents always go into a clean new directory:
  outDir = path.join(outDir, path.basename(file) + '-lovlify')
  // if the out dir already exists, delete what's there
  fsutil.cleanDir(outDir)
  return outDir
}

async function unpackFile (file, outDir) {
  outDir = prepareOutDir(file, outDir)
  file = path.resolve(file)
  console.log(`\nUnpacking ${file} to ${outDir}/ ...`)
  let code = await fs.readFileAsync(file, 'utf8')
  console.log('Searching for packed modules...')
  let loc = findPackedModules(code)
  console.log('Extracting packed modules...')
  let packedModules = extractPackedModules(code, loc)
  console.log('Unpacking packed modules to disk...')
  unpacker.unpack(packedModules, outDir)
  console.log(`\nUnpacking ${file} to ${outDir}/ complete.`)
}

function help (errText) {
  if (errText) {
    console.error(`
  ${chalk.bold.red('Error:')} ${chalk.red(errText)}`)
  }
  console.log(`
  ${chalk.bold('Usage')}: lovlify file outdir

  ${chalk.bold('file')} is an packed file/bundle.
  ${chalk.bold('outdir')} is the destination directory for the unpacked bundle.

  Notes:
    Currently only browserfy bundles are supported.
  `)
}

/**
 * Parses the packed module to find the list of packed modules
 * @param {*string} code The packed module as a string.
 */
function findPackedModules (code) {
  let ast = esprima.parse(code, {loc: true, range: true})
  let finder = new ModuleFinder()
  new VisitorContext({ silent: true, visitFunc: finder.visitFuncBound() }).visitNode(ast)
  return finder.packedModules
}

function extractPackedModules (sourceCode, packedModuleRange) {
  if (!_.isArray(packedModuleRange) || !packedModuleRange.length === 2) {
    throw new Error('unexpected range value')
  }
  let modulesDictSource = sourceCode.substring(packedModuleRange[0], packedModuleRange[1])
  modulesDictSource = 'module.exports = ' + modulesDictSource
  return moduleFromCode(modulesDictSource)
}

function moduleFromCode (sourceCode) {
  // see http://nodejs.org/api/modules.html#modules_exports_shortcut
  let exports = { }
  let module = { exports }
  let globals = { module, exports }
  vm.runInNewContext(sourceCode, globals)
  return globals.module.exports
}

module.exports = unpackFile
