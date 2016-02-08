import Letters from 'letters'

// const regex = /(\D+)(\d+)/

class Grid {
  constructor (w, h) {
    this.byName = {}
    this.byRowColumn = []

    this.rowRev = {}

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
          rev: 0
        }

        this.byName[name] = cell
        this.byRowColumn[row] = (this.byRowColumn[row] || []).concat(cell)
      }
    }

    for (let row = 0; row < height; row++) {
      this.rowRev[row] = (this.rowRev[row] || 0) + 1
    }
  }

  setByRowColumn (row, column, value) {
    this.byRowColumn[row][column].raw = value
    this.bumpCell(this.byRowColumn[row][column].name)
  }

  setByName (name, value) {
    let cell = this.byName[name]

    this.setByRowColumn(cell.row, cell.column, value)
    this.bumpCell(name)
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
      cell.col === this.numColumns() - 1 ? this.numColumns() - 1 : cell.column + 1
    )
  }

  getNextLeft (cell) {
    return this.getByRowColumn(
      cell.row,
      cell.column === 0 ? 0 : cell.column - 1
    )
  }

  static cellInRange (cell, range) {
    return between(cell.column, range.start.column, range.end.column) &&
           between(cell.row, range.start.row, range.end.row)
  }
}

const between = (n, a, b) => a < b ? (a <= n) && (n <= b) : (b <= n) && (n <= a)

export default Grid
