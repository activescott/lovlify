#!/usr/bin/env node
'use strict'
const BbPromise = require('bluebird')
const fs = BbPromise.promisifyAll(require('fs'))
const path = require('path')
const vm = require('vm')
const esprima = require('esprima')
const _ = require('lodash')
const chalk = require('chalk')

const VisitorContext = require('./lib/visitors').VisitorContext
const unpacker = require('./lib/unpacker')
const ModuleFinder = require('./lib/ModuleFinder')

const argv = process.argv.slice(2)

main().then().catch(e => console.error('Error!!!', e))

async function main () {
  if (argv.length < 1) {
    help('file name must be provided')
    return 1
  }
  let file = argv[0]
  let outDir
  if (argv.length < 2) {
    outDir = path.resolve(path.dirname(file), 'lovlify')
  } else {
    outDir = argv[1]
  }

  unpackFile(file, outDir)
}

async function unpackFile (file, outDir) {
  file = path.resolve(file)
  outDir = path.resolve(outDir, path.basename(file))
  console.log(`
  Unpacking ${file} to ${outDir}/ ...
  `)
  let code = await fs.readFileAsync(file, 'utf8')
  let loc = findPackedModules(code)
  let packedModules = extractPackedModules(code, loc)
  unpacker.unpack(packedModules, outDir)
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
