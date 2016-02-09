import formulaParser from '../lib/formula-parser'

const functions = {
  SUM: (a, b) => a + b,
  SUBTRACT: (a, b) => a - b,
  MULTIPLY: (a, b) => a * b,
  DIVIDE: (a, b) => a / b
}

export function calcFormula (cell, cells) {
  let expr = formulaParser.parse(cell.raw)
  return calcExpr(expr, cell, cells)
}

function calcExpr (expr, cell, cells) {
  switch (expr.type) {
    case 'number':
    case 'string':
      return expr.value
    case 'cell':
      return getCellValue(cells.getByName(expr.name))
    case 'range':
      return cells.getCellsInRange({
        start: cells.getByName(expr.start),
        end: cells.getByName(expr.end)
      })
      .map(c => getCellValue(c))
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
