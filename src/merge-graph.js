import Graph from 'graph.js/dist/graph.js'

class MergeGraph extends Graph {
  // cellId A1 is mergedOver A2, B1, B2
  mergedOver (cellId) { // passing A1 (in fact, the id of the cell corresponding to A1)
    try {
      return this.verticesTo(cellId)
      // returns Iterator{a2: true, b1: true, b2: true} (the ids)
    } catch (e) {
      return []
    }
  }

  isMergedOver (cellId) {
    for (let _ of this.mergedOver(cellId)) {
      return true
    }
    return false
  }

  // cellId B1 is merged into A1
  mergedIn (cellId) { // passing the id corresponding to B1
    try {
      for (let [_, baseCell] of this.verticesFrom(cellId)) {
        return baseCell // returns A1, the cell object
      }
    } catch (e) {
      return null
    }
  }

  // merging A1 over...
  merge (baseCell, over) {
    this.addVertex(baseCell.id, baseCell)

    for (let i = 0; i < over.length; i++) {
      let overCell = over[i]
      this.addVertex(overCell.id, overCell)
      this.addEdge(overCell.id, baseCell.id)
    }
  }

  unmerge (baseCell) {
    var modified = [baseCell]

    for (let [overId, overCell] of this.mergedOver(baseCell.id)) {
      this.removeEdge(overId, baseCell.id)
      modified.push(overCell)
    }

    return modified
  }

  exportToMergedProperty () {
    var merged = {}
    for (let [from, to] of this.edges()) {
      let fromName = this.vertexValue(from).name
      let toName = this.vertexValue(to).name
      merged[toName] = merged[toName] || []
      merged[toName].push(fromName)
    }
    return merged
  }

  spans (baseCell, vert) { // `vert` is an Iterator.<cellId, cell> (as returned by .mergedOver)
    if (vert.length === 0) {
      return {row: 1, col: 1}
    }

    let {row: baseRow, column: baseColumn} = baseCell
    var maxRow = baseRow
    var maxColumn = baseColumn
    for (let [_, cell] of vert) {
      let {row, column} = cell
      maxColumn = maxColumn > column ? maxColumn : column
      maxRow = maxRow > row ? maxRow : row
    }
    return {
      row: 1 + maxRow - baseRow,
      col: 1 + maxColumn - baseColumn
    }
  }
}

module.exports = MergeGraph
