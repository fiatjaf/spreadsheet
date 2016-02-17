import Rx from 'rx'
import Grid from './grid'

module.exports = makeCellsDriver

function makeCellsDriver (w, h) {
  return () =>
    Rx.Observable.just(new Grid(w, h))
      .shareReplay(1)
}
