/* global describe, it */

import {expect} from 'chai'

describe('formulas', function () {
  const parse = require('../lib/formula-parser').parse
  const render = require('../src/helpers').renderParsedFormula

  it('=FRUITMIX("banana", A23; ) + "água" * 2', function () {
    let parsed = parse('=FRUITMIX("banana", A23; ) + "água" * 2')
    expect(parsed).to.deep.equal({
      type: 'function',
      operator: true,
      fn: 'SUM',
      arguments: [{
        type: 'function',
        fn: 'FRUITMIX',
        arguments: [{
          type: 'string',
          value: 'banana',
          pos: [10, 18]
        }, {
          type: 'cell',
          name: 'a23',
          pos: [20, 23]
        }, {
          type: 'empty',
          pos: [24, 25]
        }]
      }, {
        type: 'function',
        fn: 'MULTIPLY',
        operator: true,
        arguments: [{
          type: 'string',
          value: 'água',
          pos: [29, 35]
        }, {
          type: 'number',
          value: 2,
          pos: [38, 39]
        }]
      }]
    })

    expect(render(parsed)).to.equal('=FRUITMIX("banana", A23)+"água"*2')
  })
})
