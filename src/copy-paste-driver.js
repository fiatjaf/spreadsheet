import Rx from 'rx'

let keydown$ = Rx.Observable.fromEvent(document, 'keydown')
let keyup$ = Rx.Observable.fromEvent(document, 'keyup')

module.exports = makeCopyPasteDriver

function makeCopyPasteDriver () {
  return function (values$) {
    var copiedCache = {}

    values$
      .subscribe(({raw, calc}) => {
        var elem = document.createElement('textarea')
        elem.id = 'copy-paste'
        elem.value = calc
        document.body.appendChild(elem)
        elem.focus()
        elem.selectionStart = 0
        elem.selectionEnd = calc.length

        copiedCache[calc] = raw
      })

    let ctrlCPressed$ = keydown$
      .filter(e => e.ctrlKey && e.which === 67)
      .filter(e => e.target.tagName !== 'INPUT')
    let ctrlCReleased$ = keyup$
      .filter(e => e.ctrlKey && e.which === 67)
      .filter(e => e.target.tagName !== 'INPUT')
    let ctrlVPressed$ = keydown$
      .filter(e => e.ctrlKey && e.which === 86)
      .filter(e => e.target.tagName !== 'INPUT')
    let ctrlVReleased$ = keyup$
      .filter(e => e.ctrlKey && e.which === 86)
      .filter(e => e.target.tagName !== 'INPUT')

    ctrlCReleased$
      .subscribe(() => {
        let elem = document.getElementById('copy-paste')
        document.body.removeChild(elem)
      })

    ctrlVPressed$
      .subscribe(() => {
        var elem = document.createElement('textarea')
        elem.id = 'copy-paste'
        document.body.appendChild(elem)
        elem.focus()
      })

    let pasted$ = ctrlVReleased$
      .map(() => {
        let elem = document.getElementById('copy-paste')
        let pasted = elem.value
        document.body.removeChild(elem)
        return copiedCache[pasted] || pasted
      })

    return {
      copying$: ctrlCPressed$,
      pasted$
    }
  }
}
