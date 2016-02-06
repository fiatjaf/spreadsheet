import Letters from 'letters'

const regex = /(\D+)(\d+)/

class Cells {
  constructor (w, h) {
    this.byName = {}
    this.byRowColumn = []

    this.columnRev = {}
    this.rowRev = {}

    this.resetGrid(w, h)
  }

  resetGrid (width, height) {
    this.letters = new Letters() // this is lowercase
    this.letterIndex = {}

    for (let col = 0; col < width; col++) {
      let letter = this.letters.next()
      this.letterIndex[letter] = col

      for (let row = 0; row < height; row++) {
        let name = `${letter}${row + 1}`
        let cell = {
          raw: '',
          calc: '',
          name: name,
          row: row,
          column: col
        }

        this.byName[name] = cell
        this.byRowColumn[row] = (this.byRowColumn[row] || []).concat(cell)
      }

      this.columnRev[col] = (this.columnRev[col] || 0) + 1
    }

    for (let row = 0; row < height; row++) {
      this.rowRev[row] = (this.rowRev[row] || 0) + 1
    }
  }

  setByRowColumn (row, column, value) {
    this.bumpColumnRev(column)
    this.bumpRowRev(row)

    this.byRowColumn[row][column].raw = value
  }

  setByName (name, value) {
    let [letter, rowStr] = regex.exec(name).slice(1)
    let row = parseInt(rowStr, 10) - 1
    let col = this.letterIndex[letter.toLowerCase()]

    this.setByRowColumn(row, col, value)
  }

  getByName (name) {
    return this.byName[name]
  }

  getByRowColumn (row, column) {
    return this.byRowColumn[row][column]
  }

  bumpRowRev (row) {
    this.rowRev[row]++
  }

  bumpColumnRev (row) {
    this.columnRev[row]++
  }
}

export default Cells
