import Graph from 'graph.js/dist/graph.js'

class DepGraph extends Graph {
  dependencies (cellId) {
    try {
      return this.verticesFrom(cellId)
    } catch (e) {
      return []
    }
  }

  dependents (cellId) {
    try {
      return this.verticesTo(cellId)
    } catch (e) {
      return []
    }
  }

  addDependency (cell, dependency) { // expects cell and dependency to be full cell objects
    this.addVertex(cell.id, cell)
    this.addVertex(dependency.id, dependency)
    this.addEdge(cell.id, dependency.id)
  }

  removeDependency (cellId, dependencyId) {
    this.removeEdge(cellId, dependencyId)
  }
}

const depGraph = new DepGraph()

module.exports = depGraph
