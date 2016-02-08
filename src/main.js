import {Observable} from 'rx'
import Cycle from '@cycle/core'
import {makeDOMDriver} from '@cycle/dom'
import {restart, restartable} from 'cycle-restart'

var app = require('./app').default

function preventDefaultSinkDriver (prevented$) {
  prevented$.subscribe(ev => {
    ev.preventDefault()
    if (ev.type === 'blur') {
      ev.target.focus()
    }
  })
  return Observable.empty()
}

const drivers = {
  DOM: restartable(makeDOMDriver('#container'), {pauseSinksWhileReplaying: false}),
  preventDefault: restartable(preventDefaultSinkDriver)
}

const {sinks, sources} = Cycle.run(app, drivers)

if (module && module.hot) {
  module.hot.accept('./app', () => {
    app = require('./app').default
    restart(app, drivers, {sinks, sources})
  })
}
