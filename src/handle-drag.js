import { cellInRange } from './grid'
import sequencePattern from 'sequence-pattern'

export function cellInHandleDrag (cell, {base, type, from, length}) {
  let otherside = from === 'start' ? 'end' : 'start'

  var endRow, endCol
  if (type === 'row') {
    endRow = base[from].row + length
    endCol = base[otherside].column
  } else {
    endCol = base[from].column + length
    endRow = base[otherside].row
  }

  let range = {
    start: {row: base[from].row, column: base[from].column},
    end: {row: endRow, column: endCol}
  }

  return cellInRange(cell, range)
}

export function handleValueGenerator (cells, handleDrag) {
  let generators = handleBaseSequences(cells, handleDrag)

  return function generator (sequenceIndex, distance) {
    /*
      sequenceIndex: 1 for first column or first row, 2 for second etc.
      distance: 1 for the first cell after the base range, 2 etc.
    */
    return generators[sequenceIndex].atIndex(distance).toString()
  }
}

function handleBaseSequences (cells, {type, from, length, base}) {
  var generators = {}
  var values

  if (type === 'column') {
    for (let r = base.start.row; r <= base.end.row; r++) {
      values = []

      if (from === 'end') { // heading right
        for (let c = base.start.column; c <= base.end.column; c++) {
          let val = intOrFloatOrText(cells.getByRowColumn(r, c).raw)

          values.push(val)
        }
      } else { // heading left
        for (let c = base.end.column; c >= base.start.column; c--) {
          let val = intOrFloatOrText(cells.getByRowColumn(r, c).raw)

          values.push(val)
        }
      }

      generators[r] = {values}
    }
  } else { // if (type === 'row')
    for (let c = base.start.column; c <= base.end.column; c++) {
      values = []

      if (from === 'end') { // heading right
        for (let r = base.start.row; r <= base.end.row; r++) {
          let val = intOrFloatOrText(cells.getByRowColumn(r, c).raw)

          values.push(val)
        }
      } else { // heading left
        for (let r = base.start.row; r <= base.end.row; r++) {
          let val = intOrFloatOrText(cells.getByRowColumn(r, c).raw)

          values.push(val)
        }
      }

      generators[c] = {values}
    }
  }

  for (let k in generators) {
    let values = generators[k].values
    let gen = sequencePattern.compile(values)
    generators[k].atIndex = gen.atIndex.bind(gen)
  }

  return generators
}

function intOrFloatOrText (v) {
  let float = parseFloat(v)
  if (!isNaN(float)) return float
  let int = parseInt(v, 10)
  if (!isNaN(int)) return int
  return v
}
