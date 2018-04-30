/* eslint-env mocha */
'use strict'
const expect = require('chai').expect

const BbPromise = require('bluebird')
const fs = BbPromise.promisifyAll(require('fs'))
const path = require('path')

const unpackFile = require('../index')

describe('testfiles', function () {
  it('all testfiles', async function () {
    this.timeout(40000)
    let root = path.dirname(__dirname)
    let testFiles = await fs.readdirAsync(path.join(root, 'testfiles'))
    testFiles = testFiles.map(f => path.join(root, 'testfiles', f))
    let outDir = path.join(root, 'out')
    for (let testFile of testFiles) {
      try {
        await unpackFile(testFile, outDir)
      } catch (err) {
        console.error('\nERROR with test file', testFile, err, '\n')
      }
    }
  })
})
