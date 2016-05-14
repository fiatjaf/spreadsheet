import rangegen from 'rangegen'
import cuid from 'cuid'

var calc = require('./calc').default

class Grid {
  constructor (w, h) {
    this.calc = calc.bind(this)

    this.byName = {}
    this.byId = {}
    this.byRowColumn = []

    this._currentHandle = null
    this._undoStack = []
    this._redoStack = []

    this.resetGrid(w, h)
  }

  makeCell (rowN, colN, columnId) {
    return {
      id: cuid.slug(),
      row: rowN,
      column: colN,
      raw: '',
      calc: '',
      name: this.makeCellName(rowN, colN),
      rev: Math.random(),
      handle: false,
      columnId
    }
  }

  makeCellName (row, col) {
    return `${rangegen.enc(col, true)}${row + 1}`
  }

  resetGrid (width, height) {
    this.byName = {}
    this.byId = {}
    this.byRowColumn = []

    var columnIds = {}

    for (let r = 0; r < height; r++) {
      var row = []

      for (let c = 0; c < width; c++) {
        let columnId = columnIds[c] = columnIds[c] || cuid.slug()

        let cell = this.makeCell(r, c, columnId)

        this.byName[cell.name] = cell
        this.byId[cell.id] = cell
        row.push(cell)
      }

      row.rev = Math.random()
      row.id = cuid.slug()
      this.byRowColumn[r] = row
    }
  }

  resizeGrid (width, height) {
    var oldByName = this.byName

    this.resetGrid(width, height)

    for (let cellName in oldByName) {
      let oldCell = oldByName[cellName]
      let cell = this.getByName(cellName)
      if (cell) {
        this._set(cell, oldCell.raw)

        delete this.byId[cell.id]
        cell.id = oldCell.id
        this.byId[cell.id] = cell
      }
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

  idFromName (name) { return this.byName[name].id }
  getById (id) { return this.byId[id] }
  getByName (name) { return this.byName[name] }
  getByRowColumn (row, column) { return this.byRowColumn[row][column] }
  columnIdAt (colIndex) { return this.byRowColumn[0][colIndex].columnId }

  bumpCell (cell) {
    cell.rev++
    this.byRowColumn[cell.row].rev++
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

  bumpCellsInRange (range) {
    this.bumpCells(this.getCellsInRange(range))
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
    return this.byRowColumn.map(row => row.map(cell => cell.raw))
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
