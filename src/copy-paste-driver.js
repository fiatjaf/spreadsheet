import Rx from 'rx'

let keydown$ = Rx.Observable.fromEvent(document, 'keydown')
let keyup$ = Rx.Observable.fromEvent(document, 'keyup')

module.exports = makeCopyPasteDriver

function makeCopyPasteDriver () {
  return function (values$) {
    var copiedCache = {}

    values$
      .subscribe(({raw, calc}) => {
        let elem = create()
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
    let ctrlXPressed$ = keydown$
      .filter(e => e.ctrlKey && e.which === 88)
      .filter(e => e.target.tagName !== 'INPUT')
    let ctrlXReleased$ = keyup$
      .filter(e => e.ctrlKey && e.which === 88)
      .filter(e => e.target.tagName !== 'INPUT')
    let ctrlVPressed$ = keydown$
      .filter(e => e.ctrlKey && e.which === 86)
      .filter(e => e.target.tagName !== 'INPUT')
    let ctrlVReleased$ = keyup$
      .filter(e => e.ctrlKey && e.which === 86)
      .filter(e => e.target.tagName !== 'INPUT')

    ctrlXReleased$
      .subscribe(remove)

    ctrlCReleased$
      .subscribe(remove)

    ctrlVPressed$
      .subscribe(() => {
        let elem = create()
        document.body.appendChild(elem)
        elem.focus()
      })

    let pasted$ = ctrlVReleased$
      .map(() => {
        let pasted = get().value
        return copiedCache[pasted] || pasted
      })
      .filter(v => v)
      .do(remove)

    // ctrl released
    keyup$
      .filter(e => e.which === 17)
      .subscribe(remove)

    return {
      copying$: ctrlCPressed$,
      cutting$: ctrlXPressed$,
      pasted$
    }
  }
}

function remove () {
  let elements = document.getElementsByClassName('copy-paste')
  for (let i = 0; i < elements.length; i++) {
    let elem = elements[i]
    elem.parentNode.removeChild(elem)
  }
}

function create () {
  var elem = document.createElement('textarea')
  elem.className = 'copy-paste'
  return elem
}

function get () {
  let elems = document.getElementsByClassName('copy-paste')
  return elems[elems.length - 1] || {value: null}
}
