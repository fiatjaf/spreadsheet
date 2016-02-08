import Rx from 'rx'
import Cycle from '@cycle/core'
import {makeDOMDriver} from '@cycle/dom'
import {restart, restartable} from 'cycle-restart'

var app = require('./app').default

const drivers = {
  DOM: restartable(makeDOMDriver('#container'), {pauseSinksWhileReplaying: false}),
  keydown: () => Rx.Observable.fromEvent(document.body, 'keydown')
}

const {sinks, sources} = Cycle.run(app, drivers)

if (module && module.hot) {
  module.hot.accept('./app', () => {
    app = require('./app').default
    restart(app, drivers, {sinks, sources})
  })
}
