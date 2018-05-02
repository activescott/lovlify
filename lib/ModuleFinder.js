'use strict'
const _ = require('lodash')

class ModuleFinder {
  constructor () {
    this.packedModulesCandidates = []
  }

  visitFunc (node, context) {
    // console.log('visitFunc:', node)
    if (node.type === 'ObjectExpression') {
      if (this.hasProperties(node) && this.allPropertiesAreNumbers(node)) {
        // console.log(`Found module list at range ${JSON.stringify(node.range)}, location ${JSON.stringify(node.loc)}`)
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

module.exports = ModuleFinder
