import formulajs from 'formulajs'
import * as Promise from 'bluebird'

import depGraph from './dep-graph'
import formulaParser from '../lib/formula-parser'
import { renderParsedFormula } from './helpers'
import { FORMULAERROR, CALCERROR, CALCULATING } from './const'

import { notify } from './drivers/updated-state'

/* setup functions: all functions return promises */
var functions = {}

// formulajs (excel) functions
for (let name in formulajs) {
  let fn = formulajs[name]
  functions[name] = function () {
    return Promise.resolve().then(() => fn.apply(null, arguments))
  }
}

// a simple json http function
functions['GET'] = (url) => window.fetch(url).then(res => res.text())
functions['GETJSON'] = (url) => window.fetch(url).then(res => res.json())

export default function calc (cell, changed) {
  // remove all deps since the formula was changed
  if (changed) {
    for (let dep in depGraph.dependencies(cell.name)) {
      depGraph.removeDependency(cell.name, dep)
    }
  }

  // if this cell has some others depending on it,
  // mark them to recalc
  for (let dependent in depGraph.dependents(cell.name)) {
    let depCell = this.getByName(dependent)
    if (depCell) {
      depCell.calc = CALCULATING
      this.bumpCell(depCell)
      setTimeout(() => this.recalc(depCell), 1)
    }
  }

  if (cell.raw.substr(0, 1) === '=' && cell.raw.length > 1) {
    var expr
    try {
      expr = formulaParser.parse(cell.raw)
      if (!expr) {
        // expr === null when raw is '='
        cell.raw = ''
        cell.calc = ''
      }
      cell.raw = renderParsedFormula(expr)
    } catch (e) {
      cell.calc = FORMULAERROR
      return
    }

    // calcExpr returns a promise
    calcExpr.call(this, expr, cell)
      .then(res => cell.calc = res)
      .catch(() => cell.calc = CALCERROR)
      .then(() => {
        this.bumpCell(cell)
        notify()
      })
      // we're done with this cell.
      // the driver will be notified and ensure the vtree is regenerated.

    cell.calc = CALCULATING
  } else {
    cell.calc = cell.raw
  }
}

function calcExpr (expr, cell) {
  switch (expr.type) {
    case 'number':
    case 'string':
      return Promise.resolve(expr.value)
    case 'cell':
      depGraph.addDependency(cell.name, expr.name) /* track cell dependency */
      return Promise.resolve(this.getByName(expr.name).calc)
    case 'range':
      let inRange = this.getCellsInRange({
        start: this.getByName(expr.start),
        end: this.getByName(expr.end)
      })
      var values = []
      inRange.forEach(irc => {
        depGraph.addDependency(cell.name, irc.name) /* track cell dependency */
        values.push(irc.calc)
      })
      return Promise.resolve(values)
    case 'function':
      // in this case we have an array of promises
      // returned by the child calcExprs.
      return Promise.all(
        expr.arguments
          .filter(arg => arg.type !== 'empty')
          .map(arg => calcExpr.call(this, arg, cell))
      ).then(args => functions[expr.fn].apply(null, args))
  }
}
