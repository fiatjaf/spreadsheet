import Rx from 'rx'
import Cycle from '@cycle/core'
import {makeDOMDriver} from '@cycle/dom'
import {restart, restartable} from 'cycle-restart'

const makeCustomCSSDriver = require('./custom-css-driver')
const makeCellsDriver = require('./cells-driver')
const makeCopyPasteDriver = require('./copy-paste-driver')
const makeInjectCellDriver = require('./inject-cell-driver')
const makeAdaptWidthDriver = require('./adapt-width-driver')
var app = require('./app').default

let keydown$ = Rx.Observable.fromEvent(document, 'keydown')
let keypress$ = Rx.Observable.fromEvent(document, 'keypress')

const drivers = {
  DOM: restartable(makeDOMDriver('#spreadsheet'), {pauseSinksWhileReplaying: false}),
  COPYPASTE: makeCopyPasteDriver(),
  INJECT: makeInjectCellDriver(),
  CELLS: makeCellsDriver(10, 10),
  ADAPTWIDTH: makeAdaptWidthDriver(),
  CSS: makeCustomCSSDriver({columns: {'3': 80}, rows: {'4': 40}}),
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
