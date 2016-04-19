import Rx from 'rx'
import Grid from '../grid'

module.exports = makeCellsDriver

function makeCellsDriver (w = 6, h = 6) {
  const grid = new Grid(w, h)
  let grid$ = Rx.Observable.just(grid)
    .shareReplay(1)

  return function (cells$) {
    return grid$
  }
}
