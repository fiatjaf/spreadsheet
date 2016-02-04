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
        let name = `${letter}${row}`
        let cell = {raw: '', calc: '', name: name, row: row, col: col}

        this.byName[name] = cell
        this.byRowColumn[row] = (this.byRowColumn[row] || []).concat(cell)
      }

      this.columnRev[col] = (this.columnRev || 0) + 1
      this.rowRev[col] = (this.rowRev || 0) + 1
    }
  }

  setByRowColumn (row, column, value) {
    this.columnRev[column]++
    this.rowRev[row]++

    this.byRowColumn[row][column].raw = value
  }

  setByName (name, value) {
    let [letter, rowStr] = regex.exec(name).slice(1)
    let row = parseInt(rowStr, 10)
    let col = letter.toLowerCase()

    this.setByRowColumn(row, col, value)
  }

  getByName (name) {
    return this.byName[name]
  }

  getByRowColumn (row, column) {
    return this.byRowColumn[row][column]
  }
}

export default Cells
