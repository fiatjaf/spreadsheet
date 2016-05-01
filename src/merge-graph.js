import Graph from 'graph.js/dist/graph.js'

class MergeGraph extends Graph {
  constructor (merged = {}) {
    // expects an object of arrays like {a1: [a2, b1, b2], c5: [c6]}
    super()

    this._colSpan = {}
    this._rowSpan = {}

    for (let base in merged) {
      this.merge(base, merged[base])
    }
  }

  // cell A1 is mergedOver A2, B1, B2
  mergedOver (cell) { // passing a1
    try {
      return this.verticesTo(cell) // returns Iterator{a2: true, b1: true, b2: true}
    } catch (e) {
      return []
    }
  }

  isMergedOver (cell) {
    for (let _ of this.mergedOver(cell)) {
      return _ && true
    }
    return false
  }

  // cell B1 is merged into A1
  mergedIn (cell) { // passing b1
    try {
      for (let [base] of this.verticesFrom(cell)) {
        return base // returns a1
      }
    } catch (e) {
      return null
    }
  }

  // merging A1 over...
  merge (base, over) {
    const l = /\D+/
    const n = /\d+/
    var firstNumber = n.exec(base)[0]
    var lastNumber = firstNumber
    var firstLetter = l.exec(base)[0]
    var lastLetter = firstLetter

    this.addVertex(base)

    for (let i = 0; i < over.length; i++) {
      this.addVertex(over[i])
      this.addEdge(over[i], base)

      let number = n.exec(over[i])[0]
      let letter = l.exec(over[i])[0]
      lastNumber = number > lastNumber ? number : lastNumber
      lastLetter = letter > lastLetter ? letter : lastLetter
    }

    this._rowSpan[base] = parseInt(lastNumber) - parseInt(firstNumber) + 1
    this._colSpan[base] = lastLetter.charCodeAt() - firstLetter.charCodeAt() + 1
  }

  unmerge (base) {
    var modified = [base]

    for (let [o] of this.mergedOver(base)) {
      this.removeEdge(o, base)
      modified.push(o)
    }

    delete this._rowSpan[base]
    delete this._colSpan[base]

    return modified
  }

  rowSpan (cell) {
    return this._rowSpan[cell] || 1
  }

  colSpan (cell) {
    return this._colSpan[cell] || 1
  }
}

module.exports = MergeGraph

