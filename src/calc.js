import Graph from 'beirada'
import functions from 'formulajs'

import formulaParser from '../lib/formula-parser'

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
    setTimeout(() => this.recalc(dependent), 1)
  }

  if (cell.raw.substr(0, 1) === '=' && cell.raw.length > 1) {
    let expr = formulaParser.parse(cell.raw)
    return calcExpr(expr, cell, this)
  } else {
    return cell.raw
  }
}

function calcExpr (expr, cell, cells) {
  switch (expr.type) {
    case 'number':
    case 'string':
      return expr.value
    case 'cell':
      // track cell dependency
      graph.dir(cell.name, expr.name)

      return getCellValue(cells.getByName(expr.name))
    case 'range':
      let inRange = cells.getCellsInRange({
        start: cells.getByName(expr.start),
        end: cells.getByName(expr.end)
      })
      var values = []
      inRange.forEach(irc => {
        // track cell dependency
        graph.dir(cell.name, irc.name)

        values.push(getCellValue(irc))
      })
      return values
    case 'function':
      return functions[expr.fn].apply(null,
        expr.arguments .map(arg =>
          calcExpr(arg, cell, cells)
        )
      )
  }
}

function getCellValue (cell) {
  return cell.calc || cell.raw
}
