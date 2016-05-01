import Graph from 'graph.js/dist/graph.js'

class DepGraph extends Graph {
  dependencies (cell) {
    try {
      return this.verticesFrom(cell)
    } catch (e) {
      return []
    }
  }

  dependents (cell) {
    try {
      return this.verticesTo(cell)
    } catch (e) {
      return []
    }
  }

  addDependency (cell, dependency) {
    this.addVertex(cell)
    this.addVertex(dependency)
    this.addEdge(cell, dependency)
  }

  removeDependency (cell, dependency) {
    this.removeEdge(cell, dependency)
  }
}

const depGraph = new DepGraph()

module.exports = depGraph
