import rangegen from 'rangegen'
import cuid from 'cuid'

var calc = require('./calc').default

class Grid {
  constructor (w, h) {
    this.calc = calc.bind(this)

    this.byName = {}
    this.byRowColumn = []

    this.rowRev = {}

    this._currentHandle = null
    this._undoStack = []
    this._redoStack = []

    this.resetGrid(w, h)
  }

  makeCell (row, col) {
    return {
      id: cuid.slug(),
      raw: '',
      calc: '',
      name: this.makeCellName(row, col),
      row: row,
      column: col,
      rev: Math.random(),
      handle: false
    }
  }

  makeCellName (row, col) {
    return `${rangegen.enc(col, true)}${row + 1}`
  }

  resetGrid (width, height) {
    this.byName = {}
    this.byRowColumn = []

    for (let col = 0; col < width; col++) {
      for (let row = 0; row < height; row++) {
        let cell = this.makeCell(row, col)

        this.byName[cell.name] = cell
        this.byRowColumn[row] = (this.byRowColumn[row] || []).concat(cell)
      }
    }

    for (let row = 0; row < height; row++) {
      this.rowRev[row] = (this.rowRev[row] || Math.random()) + 1
    }
  }

  resizeGrid (width, height) {
    var oldByName = this.byName

    this.resetGrid(width, height)

    for (let cellName in oldByName) {
      let cell = this.getByName(cellName)
      if (cell) this._set(cell, oldByName[cellName].raw)
    }
  }

  _set (cell, value) {
    cell.raw = value
    this.calc(cell, true)
    this.bumpCell(cell)
  }

  set (cell, value) {
    // previous value in the undo stack, redo stack is cleaned
    this._redoStack = []
    let count = this._undoStack.push({[cell.name]: cell.raw})
    if (count > 100) this._undoStack.shift()

    this._set(cell, value.trim())
  }

  setMany (cellObjects, rawValues) {
    var undo = {}
    for (let i = 0; i < cellObjects.length; i++) {
      let cell = cellObjects[i]
      undo[cell.name] = cell.raw
      this._set(cell, rawValues[i])
    }
    this._redoStack = []
    let count = this._undoStack.push(undo)
    if (count > 100) this._undoStack.shift()
  }

  setByName (name, value) {
    let cell = this.byName[name]
    this.set(cell, value)
  }

  undo () {
    let undo = this._undoStack.pop()
    if (undo) {
      var redo = {}
      for (let cellName in undo) {
        let cell = this.getByName(cellName)
        redo[cell.name] = cell.raw
        let undoValue = undo[cellName]
        this._set(cell, undoValue)
      }
      this._redoStack.push(redo)
    }
  }

  redo () {
    let redo = this._redoStack.pop()
    if (redo) {
      var undo = {}
      for (let cellName in redo) {
        let cell = this.getByName(cellName)
        undo[cell.name] = cell.raw
        let redoValue = redo[cellName]
        this._set(cell, redoValue)
      }
      this._undoStack.push(undo)
    }
  }

  unsetHandle () {
    let old = this._currentHandle
    if (old && old.handle) {
      old.handle = false
      this.bumpCell(old)
    }
  }

  setHandle (cell) {
    this.unsetHandle()

    try {
      cell.handle = true
      this._currentHandle = cell
      this.bumpCell(cell)
    } catch (e) {
      // maybe we were passed an undefined cell
    }
  }

  recalc (cell) {
    this.calc(cell, false)
    this.bumpCell(cell)
  }

  getByName (name) {
    return this.byName[name]
  }

  getByRowColumn (row, column) {
    return this.byRowColumn[row][column]
  }

  bumpCell (cell) {
    cell.rev++
    this.rowRev[cell.row]++
  }

  bumpCellByName (cellName) {
    let cell = this.getByName(cellName)
    this.bumpCell(cell)
  }

  bumpCells (cells) {
    for (let i = 0; i < cells.length; i++) {
      this.bumpCell(cells[i])
    }
  }

  bumpAllCells () {
    for (let name in this.byName) {
      this.bumpCell(this.byName[name])
    }
  }

  getCellsInRange (range) {
    var inRange = []

    try {
      let first = this.firstCellInRange(range)
      let last = this.lastCellInRange(range)

      for (let r = first.row; r <= last.row; r++) {
        for (let c = first.column; c <= last.column; c++) {
          inRange.push(this.getByRowColumn(r, c))
        }
      }
    } catch (e) {
      return []
    }

    return inRange
  }

  firstCellInRange ({start, end}) {
    // in a given range, returns the cell at the top-left corner
    let firstRow = start.row < end.row ? start.row : end.row
    let firstCol = start.column < end.column ? start.column : end.column

    return this.getByRowColumn(firstRow, firstCol)
  }

  lastCellInRange ({start, end}) {
    // in a given range, returns the cell at the bottom-right corner
    let lastRow = start.row > end.row ? start.row : end.row
    let lastCol = start.column > end.column ? start.column : end.column

    return this.getByRowColumn(lastRow, lastCol)
  }

  numRows () {
    return this.byRowColumn.length
  }

  numColumns () {
    try {
      return this.byRowColumn[0].length
    } catch (e) {
      return 0
    }
  }

  getNextUp (cell) {
    return this.getByRowColumn(
      cell.row === 0 ? 0 : cell.row - 1,
      cell.column
    )
  }

  getNextDown (cell) {
    return this.getByRowColumn(
      cell.row === this.numRows() - 1 ? this.numRows() - 1 : cell.row + 1,
      cell.column
    )
  }

  getNextRight (cell) {
    return this.getByRowColumn(
      cell.row,
      cell.column === this.numColumns() - 1 ? this.numColumns() - 1 : cell.column + 1
    )
  }

  getNextLeft (cell) {
    return this.getByRowColumn(
      cell.row,
      cell.column === 0 ? 0 : cell.column - 1
    )
  }

  exportToArray () {
    var a = []
    for (let r = 0; r < this.byRowColumn.length; r++) {
      var aa = []
      for (let c = 0; c < this.byRowColumn[r].length; c++) {
        aa.push(this.byRowColumn[r][c].raw)
      }
      a.push(aa)
    }
    return a
  }
}

export const between = (n, a, b) => a < b ? (a <= n) && (n <= b) : (b <= n) && (n <= a)
export function cellInRange (cell, range) {
  try {
    return between(cell.column, range.start.column, range.end.column) &&
           between(cell.row, range.start.row, range.end.row)
  } catch (e) {
    console.log('range.end not set.')
    return false
  }
}

export default Grid
