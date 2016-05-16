require('babel-polyfill')

import Rx from 'rx'
import Cycle from '@cycle/core'
import {makeDOMDriver} from '@cycle/dom'

const makeCustomCSSDriver = require('./drivers/custom-css')
const makeCellsDriver = require('./drivers/cells')
const makeCopyPasteDriver = require('./drivers/copy-paste')
const makeInjectCellDriver = require('./drivers/inject-cell')
const makeAdaptWidthDriver = require('./drivers/adapt-width')
const makeContextMenuDriver = require('./drivers/context-menu')
const updatedStateDriver = require('./drivers/updated-state')
var app = require('./app').default

let keydown$ = Rx.Observable.fromEvent(document, 'keydown')
let keypress$ = Rx.Observable.fromEvent(document, 'keypress')

const drivers = {
  DOM: makeDOMDriver('#spreadsheet'),
  COPYPASTE: makeCopyPasteDriver(),
  INJECT: makeInjectCellDriver(),
  CELLS: makeCellsDriver(10, 10),
  STATE: () => Rx.Observable.just({merged: { 'a1': ['b1', 'b2', 'a2'] }}),
  ADAPTWIDTH: makeAdaptWidthDriver(),
  CONTEXTMENU: makeContextMenuDriver(),
  UPDATED: updatedStateDriver,
  CSS: makeCustomCSSDriver(),
  keydown: () => keydown$.share(),
  keypress: () => keypress$.share()
}

Cycle.run(app, drivers)
