import Letters from 'letters'

var calc = require('./calc').default

class Grid {
  constructor (w, h) {
    this.calc = calc.bind(this)

    this.byName = {}
    this.byRowColumn = []

    this.rowRev = {}

    this._currentHandle = null

    this.resetGrid(w, h)
  }

  resetGrid (width, height) {
    this.letters = new Letters() // this is lowercase

    for (let col = 0; col < width; col++) {
      let letter = this.letters.next()

      for (let row = 0; row < height; row++) {
        let name = `${letter}${row + 1}`
        let cell = {
          raw: '',
          calc: '',
          name: name,
          row: row,
          column: col,
          rev: 0,
          handle: false
        }

        this.byName[name] = cell
        this.byRowColumn[row] = (this.byRowColumn[row] || []).concat(cell)
      }
    }

    for (let row = 0; row < height; row++) {
      this.rowRev[row] = (this.rowRev[row] || 0) + 1
    }
  }

  setByName (name, value) {
    let cell = this.byName[name]
    cell.raw = value
    this.calc(cell, true)
    this.bumpCell(cell.name)
  }

  setByRowColumn (row, column, value) {
    let cell = this.byRowColumn[row][column]
    cell.raw = value
    this.calc(cell, true)
    this.bumpCell(cell.name)
  }

  unsetHandle () {
    let old = this._currentHandle
    if (old) {
      old.handle = false
      this.bumpCell(old.name)
    }
  }

  setHandle (cell) {
    this.unsetHandle()

    cell.handle = true
    this._currentHandle = cell
    this.bumpCell(cell.name)
  }

  recalc (name) {
    let cell = this.byName[name]
    this.calc(cell, false)
    this.bumpCell(cell.name)
  }

  getByName (name) {
    return this.byName[name]
  }

  getByRowColumn (row, column) {
    return this.byRowColumn[row][column]
  }

  bumpCell (cellName) {
    let cell = this.byName[cellName]
    cell.rev++
    this.rowRev[cell.row]++
  }

  bumpCellByRowColumn (row, column) {
    let cell = this.byRowColumn[row][column]
    this.bumpCell(cell.name)
  }

  bumpCells (names) {
    names.forEach(name => this.bumpCell(name))
  }

  bumpAllCells () {
    for (let name in this.byName) {
      this.bumpCell(name)
    }
  }

  getCellsInRange (range) {
    var inRange = []
    for (let name in this.byName) {
      let cell = this.byName[name]
      if (Grid.cellInRange(cell, range)) {
        inRange.push(cell)
      }
    }
    return inRange
  }

  lastCellInRange (range) {
    // in a given range, returns the cell at the bottom-right corner
    let start = range.start
    let end = range.end
    let lastRow = start.row > end.row ? start.row : end.row
    let lastCol = start.column > end.column ? start.column : end.column

    return this.getByRowColumn(lastRow, lastCol)
  }

  numRows () {
    return this.byRowColumn.length
  }

  numColumns () {
    return this.byRowColumn[0].length
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

  static cellInRange (cell, range) {
    try {
      return between(cell.column, range.start.column, range.end.column) &&
             between(cell.row, range.start.row, range.end.row)
    } catch (e) {
      console.log('range.end not set.')
      return false
    }
  }
}

const between = (n, a, b) => a < b ? (a <= n) && (n <= b) : (b <= n) && (n <= a)

export default Grid
