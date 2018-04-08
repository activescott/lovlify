'use strict'
const _ = require('lodash')

class VisitorContext {
  constructor (options) {
    this.indentLevel = 0
    this.padChar = ' '
    this.vistedNodes = 0
    this.silent = options.silent || false
    this.maxNodes = options.maxNodes || Number.MAX_VALUE
    this.visitFunc = options.visitFunc
  }

  indent () {
    this.indentLevel++
  }

  unindent () {
    this.indentLevel--
  }

  info (msg) {
    let pad = this.padChar.repeat(this.indentLevel)
    if (!this.silent) console.log(`${pad}${msg}`)
  }

  prop (node, propertyName, extra) {
    let value = node[propertyName]
    if (this.isESTreeNode(value)) {
      this.visitChildren(node, propertyName)
    } else {
      if (extra) {
        this.info(`${propertyName}: ${value} (${extra})`)
      } else {
        this.info(`${propertyName}: ${value}`)
      }
    }
  }

  isESTreeNode (value) {
    if (_.isArray(value) && _.size(value) > 0) {
      value = value[0]
    }
    // CAUTION: very week test. To be more specific test for all type names and look on the constructor.name ??
    return value && value.hasOwnProperty('type')
  }

  visitNode (node, parentNode) {
    if (!node) {
      throw new Error('node cannot be null')
    }
    if (this.vistedNodes++ > this.maxNodes) throw new Error('maximum nodes exceeded!')
    if (parentNode) node.parentNode = parentNode
    this.indent()
    let v = VisitorContext.visitors[node.type] || new UnknownNodeVisitor()
    // this.info(`Visitor ${v.constructor.name} for node ${node.constructor.name}`)
    if (this.visitFunc) {
      this.visitFunc(node, this)
    }
    v.visit(node, this)
    this.unindent()
  }

  visitChildren (node, propertyName) {
    this.info(propertyName + ':')
    this.indent()
    let val = node[propertyName]
    if (_.isArray(val)) {
      _.forEach(val, v => this.visitNode(v, node))
    } else {
      if (val) this.visitNode(val, node)
      else this.info(node, propertyName + ' is null or undefined')
    }
    this.unindent()
  }
}

class Visitor {
  visit (node, context) {
    context.prop(node, 'type')
  }
}

class ProgramVisitor extends Visitor {
  visit (node, context) {
    super.visit(node, context)
    context.prop(node, 'sourceType')
    context.visitChildren(node, 'body')
  }
}

class UnknownNodeVisitor extends Visitor {
  visit (node, context) {
    super.visit(node, context)
    const ignoredProps = {
      'type': 'type',
      'parentNode': 'parentNode'
    }
    let props = Object.keys(node).filter(p => !(p in ignoredProps))
    _.forEach(props, p => context.prop(node, p))
  }
}

class ExpressionStatementVisitor extends Visitor {
  visit (node, context) {
    super.visit(node, context)
    context.indent()
    context.visitChildren(node, 'expression')
    context.unindent()
  }
}

class UnaryExpressionVisitor extends Visitor {
  visit (node, context) {
    super.visit(node, context)
    context.prop(node, 'operator')
    context.visitChildren(node, 'argument')
  }
}

class CallExpressionVisitor extends Visitor {
  visit (node, context) {
    super.visit(node, context)
    context.visitChildren(node, 'callee')
    context.visitChildren(node, 'arguments')
  }
}

class FunctionExpressionVisitor extends Visitor {
  visit (node, context) {
    super.visit(node, context)
    context.prop(node, 'id')
    context.prop(node, 'generator')
    context.prop(node, 'expression')
    context.prop(node, 'async')
    context.visitChildren(node, 'params')
    context.visitChildren(node, 'body')
    // context.info('body skipped!')
  }
}

VisitorContext.visitors = {
  'UnknownNode': new UnknownNodeVisitor(),
  'Program': new ProgramVisitor(),
  'ExpressionStatement': new ExpressionStatementVisitor(),
  'UnaryExpression': new UnaryExpressionVisitor(),
  'CallExpression': new CallExpressionVisitor(),
  'FunctionExpression': new FunctionExpressionVisitor()
}

module.exports.VisitorContext = VisitorContext
module.exports.ProgramVisitor = ProgramVisitor
module.exports.UnknownNodeVisitor = UnknownNodeVisitor
module.exports.ExpressionStatementVisitor = ExpressionStatementVisitor
module.exports.UnaryExpressionVisitor = UnaryExpressionVisitor
module.exports.CallExpressionVisitor = CallExpressionVisitor
module.exports.FunctionExpressionVisitor = FunctionExpressionVisitor
