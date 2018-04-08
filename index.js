'use strict'
const BbPromise = require('bluebird')
const fs = BbPromise.promisifyAll(require('fs'))
const path = require('path')
const vm = require('vm')
const esprima = require('esprima')
const _ = require('lodash')
const VisitorContext = require('./lib/visitors').VisitorContext
const unpacker = require('./lib/unpacker')

// load the test files and see if we can find a AST signature of the modules:

main().then().catch(e => console.error('Error!!!', e))

async function main () {
  let root = path.resolve('.')
  let testFiles = await fs.readdirAsync(path.join(root, 'testfiles'))
  for (let testFile of testFiles) {
    try {
      console.log('\nUnpacking', testFile)
      let code = await fs.readFileAsync(path.join(root, 'testfiles', testFile), 'utf8')
      let loc = findPackedModules(code)
      let packedModules = extractPackedModules(code, loc)
      unpacker.unpack(packedModules, path.join(root, 'out', testFile))
    } catch (err) {
      console.error('\nERROR with test file', testFile, err, '\n')
    }
  }
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

class ModuleFinder {
  constructor () {
    this.packedModulesCandidates = []
  }

  visitFunc (node, context) {
    // console.log('visitFunc:', node)
    if (node.type === 'ObjectExpression') {
      if (this.hasProperties(node) && this.allPropertiesAreNumbers(node)) {
        console.log(`Found module list at range ${JSON.stringify(node.range)}, location ${JSON.stringify(node.loc)}`)
        this.packedModulesCandidates.push(node.range)
      }
    }
  }

  visitFuncBound () {
    return this.visitFunc.bind(this)
  }

  /**
   * Returns the found candidate
   */
  get packedModules () {
    if (_.size(this.packedModulesCandidates) > 1) {
      let locStr = _.join(this.packedModulesCandidates, ';')
      throw new Error('Found multiple candidates for the module list:' + locStr)
    } else if (_.size(this.packedModulesCandidates) === 0) {
      throw new Error('No modules list found.')
    }
    return this.packedModulesCandidates[0]
  }

  hasProperties (objectExpressionNode) {
    return _.size(objectExpressionNode.properties) > 0
  }

  allPropertiesAreNumbers (objectExpressionNode) {
    for (let propNode of objectExpressionNode.properties) {
      console.assert(propNode.type === 'Property', 'expected node to be type property!')
      if (propNode.key.type === 'Literal' && _.isNumber(propNode.key.value)) {
        if (propNode.value.type !== 'ArrayExpression') {
          // console.log('Prop', propNode.value, '==', propNode.value, '(not ArrayExpression)')
          return false
        }
      } else {
        return false
      }
    }
    return true
  }
}
