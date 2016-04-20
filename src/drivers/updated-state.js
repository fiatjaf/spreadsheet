/* we're cheating on this
   this driver exists to get messages from a loophole at ./calc.js,
   and then notify the app that the calculation was done. */

import Rx from 'rx'

module.exports = updatedStateDriver
module.exports.notify = notify

var notice$ = new Rx.ReplaySubject(1)

function updatedStateDriver () {
  return notice$
}

notice$.onNext(null)

function notify () {
  notice$.onNext(null)
}
