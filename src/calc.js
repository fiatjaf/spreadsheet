import Graph from 'beirada'
import functions from 'formulajs'

import formulaParser from '../lib/formula-parser'
import {renderParsedFormula} from './helpers'
import {FORMULAERROR, CALCERROR, CALCULATING} from './const'

const graph = new Graph()

export default function calc (cell, changed) {
  // remove all deps since the formula was changed
  if (changed) {
    for (let dep in graph.adj(cell.name)) {
      graph.deldir(cell.name, dep)
    }
  }

  // if this cell has some other depending on it,
  // mark it to recalc
  for (let dependent in graph.inadj(cell.name)) {
    cell.calc = CALCULATING
    this.bumpCell(cell.name)
    setTimeout(() => this.recalc(dependent), 1)
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
    try {
      cell.calc = calcExpr(expr, cell, this)
    } catch (e) {
      cell.calc = CALCERROR
    }
  } else {
    cell.calc = cell.raw
  }
}

function calcExpr (expr, cell, cells) {
  switch (expr.type) {
    case 'number':
    case 'string':
      return expr.value
    case 'cell':
      graph.dir(cell.name, expr.name) /* track cell dependency */
      return cells.getByName(expr.name).calc
    case 'range':
      let inRange = cells.getCellsInRange({
        start: cells.getByName(expr.start),
        end: cells.getByName(expr.end)
      })
      var values = []
      inRange.forEach(irc => {
        graph.dir(cell.name, irc.name) /* track cell dependency */
        values.push(irc.calc)
      })
      return values
    case 'function':
      return functions[expr.fn].apply(null,
        expr.arguments
        .filter(arg => arg.type !== 'empty')
        .map(arg => calcExpr(arg, cell, cells))
      )
  }
}
