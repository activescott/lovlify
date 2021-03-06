'use strict'
const { mkdir } = require('./fsutil')
const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const prettier = require('prettier')

let moduleNameToNumberMap = null
let moduleNumberToNameMapOld = null

function unpack (packedModulesObject, outDir) {
  moduleNameToNumberMap = buildNameToNumberMap(packedModulesObject)
  moduleNumberToNameMapOld = buildNumberToNameMap(moduleNameToNumberMap)

  let rootModule = ModuleInfo.loadAllModules(packedModulesObject)
  if (!fs.existsSync(outDir)) {
    throw new Error('The directory does not exist at ' + outDir)
  }
  rootModule.writeFile(outDir)
  console.log('Discovered the following referenced NPM modules:')
  _.uniq(npmModules).sort().forEach(s => console.log(`'${s}',`))
}

module.exports.unpack = unpack

let npmModules = []
function trackNpmModule (moduleName) {
  npmModules.push(moduleName)
}

function buildNameToNumberMap (allModules) {
  // build module name => ID map from dependencies
  let moduleNameToNumberMap = {}
  for (let k in allModules) {
    let moduleDependencies = allModules[k][1]
    // moduleDependencies is an object with keys as module names and values as module numbers (which are keys in allModules:
    moduleNameToNumberMap = Object.assign(moduleNameToNumberMap, moduleDependencies)
  }
  return moduleNameToNumberMap
}

function buildNumberToNameMap (moduleNameToNumberMap) {
  let moduleNumberToNameMap = {}
  for (let k in moduleNameToNumberMap) {
    let newKey = moduleNameToNumberMap[k]
    let newValue = k
    if (!(newKey in moduleNumberToNameMap)) {
      moduleNumberToNameMap[newKey] = []
    }
    moduleNumberToNameMap[newKey].push(newValue)
  }
  return moduleNumberToNameMap
}

class ModuleInfo {
  /**
   * Initializes a moduleInfo
   */
  constructor (number, code, rawDependencyMap) {
    this.number = number
    this.code = code
    // this is a name => number mapping of dependencies used by this module;
    this.rawDependencyMap = rawDependencyMap
    this.path = ''
    this.referencedBy = []
    this.isNpmModule = false
  }

  static isNpmModule (moduleName) {
    // see http://nodejs.org/api/modules.html#modules_all_together
    const nodeStartsWithStrs = ['/', './', '../']
    let i = nodeStartsWithStrs.findIndex(s => _.startsWith(moduleName, s))
    return i < 0
  }

  static loadAllModules (allRawModules) {
    // allRawModules is the raw modules from the original packed main-unminified.js.
    let moduleInfos = {}

    for (let modNum in allRawModules) {
      let m = new ModuleInfo(modNum, allRawModules[modNum][0], allRawModules[modNum][1])
      moduleInfos[modNum] = m
    }

    // all modules loaded, now hydrate dependencies of each
    for (let modNum in moduleInfos) {
      moduleInfos[modNum].hydrateChildren(moduleInfos)
    }

    // now tell each module all the names it was referenced by (this is only used to add a comment to each outputted module for FYI/troubleshooting)
    for (let modNum in moduleNumberToNameMapOld) {
      moduleInfos[modNum].setReferencedBy(moduleNumberToNameMapOld[modNum])
    }

    // now find the only unreferenced module (normally there won't be multiple or the packer didn't do it's job)
    let rootModules = ModuleInfo.findRootModules(moduleInfos)
    if (_.size(rootModules) > 1) {
      let debugMsg = rootModules.map(m => m.path).join('\n')
      throw new Error(`Expected to find only a single root root module, but found ${_.size(rootModules)}: ${debugMsg}`)
    } else if (_.isEmpty(rootModules)) {
      throw new Error('No root modules found')
    }
    // set the main module's path (which will recursively set everyone else's path:
    let root = rootModules[0]

    root.setPath('/ROOT_APP_MODULE.js', true, {})
    return root
  }

  static findRootModules (moduleInfos) {
    let unreferenced = _.filter(moduleInfos, mod => _.isEmpty(mod.referencedBy))
    return _.filter(unreferenced, mod => _.isEmpty(mod.path))
  }

  setReferencedBy (arrayOfReferencedByNames) {
    this.referencedBy = arrayOfReferencedByNames
  }

  hydrateChildren (allModuleInfos) {
    this.children = []
    for (let modName in this.rawDependencyMap) {
      let modNumber = this.rawDependencyMap[modName]
      let child = allModuleInfos[modNumber]
      if (child) {
        child.setParent(this)
        child.setPath(modName, false)
        this.children.push(child)
      } else {
        console.error(`Module not found for module number ${modNumber}`)
      }
    }
  }

  setParent (parent) {
    this.parent = parent
  }

  hasAncestor (moduleInfo) {
    if (this.parent == null) {
      console.log('ROOT:', this.number)
    }
    let parent = this
    while (parent != null) {
      if (parent === moduleInfo) {
        return true
      }
      parent = parent.parent
    }
    return false
  }

  /**
   * Used to set the path of this module as it was originally used in require(..). This is inferred from a dependent's dependencyMap/require.
   */
  setPath (thePath, setRecursively, callers) {
    if (callers && callers[this.number.toString()] != null) {
      console.log('callers!')
      return
    } else if (callers) {
      callers[this.number.toString()] = this
    }

    this.path = thePath
    if (setRecursively) {
      for (let child of this.children) {
        let childPath = path.resolve(path.dirname(this.path), child.path)
        if (child.path !== childPath) {
          if (!ModuleInfo.isNpmModule(child.path)) {
            child.setPath(childPath, setRecursively, callers)
          }
        }
      }
    }
    if (callers) {
      callers[this.number.toString()] = null
    }
  }

  static formatCode (code) {
    // unfortunately, standard seems to skip over code that was emitted all on a single line. So we use prettier.
    // return standard.lintTextSync(code, { fix: true }).results[0].output
    return prettier.format(code)
  }

  isJson () {
    let isJson = this.path.endsWith('.json')
    return isJson
  }

  removeModuleWrapper () {
    /**
     * Every module is wrapped in function (require, module, exports) { <code> }
     * Since we only want code we strip out the rest:
     */
    let code = this.code.toString()
    let wrapperFuncBodyStart = code.indexOf('{')
    let wrapperFuncBodyEnd = code.lastIndexOf('}')
    code = code.substring(wrapperFuncBodyStart + 1, wrapperFuncBodyEnd)
    if (this.isJson()) {
      // json still looks like module.exports = { ... }
      let jsonStart = code.indexOf('{')
      code = code.substring(jsonStart)
    }
    return code
  }

  fixedCode () {
    let code = this.removeModuleWrapper()
    if (this.isJson()) {
      let exportedJson = getExportsFromModuleFunc(this.code)
      return JSON.stringify(exportedJson, null, 2)
    } else {
      let commentPrefix = `/* This module was module number ${this.number} in the old packed code. It was referenced in the old code using \`require(<module name>)\` by the following module names:\n`
      commentPrefix += this.referencedBy.map(name => '* ' + name).join('\n')
      commentPrefix += '\n*/\n'
      code = commentPrefix + code
      code = ModuleInfo.formatCode(code)
      return code
    }
  }

  writeFile (outDir) {
    if (this.didWriteFile) {
      return
    }
    this.didWriteFile = true
    if (ModuleInfo.isNpmModule(this.path)) {
      trackNpmModule(this.path)
      return
    }
    let code = this.fixedCode()
    let fname = this.path
    if (!fname.endsWith('.js') && !this.isJson()) {
      fname = fname + '.js'
    }
    let dirname = path.dirname(path.join(outDir, fname))
    mkdir(dirname)
    fs.writeFileSync(path.join(outDir, fname), code)
    for (let c of this.children) {
      c.writeFile(outDir)
    }
  }
}

function getExportsFromModuleFunc (moduleFunc) {
  // see http://nodejs.org/api/modules.html#modules_exports_shortcut
  let exports = { }
  let module = { exports }
  function fakeRequire () {
    // we're only using this for json so we don't expect this to be called.
    throw new Error('unexpected require call!!')
  }
  moduleFunc(fakeRequire, module, exports)
  return module.exports
}
