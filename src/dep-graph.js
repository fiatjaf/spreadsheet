import Graph from 'beirada'

const depGraph = new Graph()

module.exports = depGraph

module.exports.dependencies = depGraph.adj.bind(depGraph)
module.exports.dependents = depGraph.inadj.bind(depGraph)
module.exports.addDependency = (cell, dependency) => depGraph.dir(cell, dependency)
module.exports.removeDependency = (cell, dependency) => depGraph.deldir(cell, dependency)
