import Rx from 'rx'
import Cycle from '@cycle/core'
import {makeDOMDriver} from '@cycle/dom'
import {restart, restartable} from 'cycle-restart'

const makeCopyPasteDriver = require('./copy-paste-driver')
const makeInjectCellDriver = require('./inject-cell-driver')
var app = require('./app').default

let keydown$ = Rx.Observable.fromEvent(document, 'keydown')
let keypress$ = Rx.Observable.fromEvent(document, 'keypress')

const drivers = {
  DOM: restartable(makeDOMDriver('#container'), {pauseSinksWhileReplaying: false}),
  COPYPASTE: makeCopyPasteDriver(),
  INJECT: makeInjectCellDriver(),
  keydown: () => keydown$.share(),
  keypress: () => keypress$.share()
}

const {sinks, sources} = Cycle.run(app, drivers)

if (module && module.hot) {
  module.hot.accept('./app', () => {
    app = require('./app').default
    restart(app, drivers, {sinks, sources})
  })
}
