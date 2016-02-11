import {deselect} from './helpers'
import formulaParser from '../lib/formula-parser'

export function ControlledInputHook (injectedText) {
  this.injectedText = injectedText
}
ControlledInputHook.prototype.hook = function hook (element) {
  element.value = this.injectedText
}

export function FocusHook () {}
FocusHook.prototype.hook = function hook (element) {
  deselect()
  setTimeout(() => element.focus(), 1)
}

export function InputWidget (value, injected) {
  this.value = value
  this.injected = injected
}
InputWidget.prototype.type = 'Widget'
InputWidget.prototype.init = function () {
  let input = document.createElement('input')
  input.value = this.value
  setTimeout(input.focus.bind(input), 0)

  /* listen for inputs and increase the size if necessary */
  let adaptWidth = () => {
    if (input.offsetWidth < input.scrollWidth) {
      input.style.width = (input.scrollWidth + 2) + 'px'
    }
  }
  input.addEventListener('input', adaptWidth)
  setTimeout(adaptWidth)

  return input
}
InputWidget.prototype.update = function (prev, input) {
  if (this.injected) {
    // this is all for injecting an argument

    let isModernBrowser = ('selectionStart' in input &&
                           'selectionEnd' in input)

    // get the cursor position
    var caretPos
    if (isModernBrowser) {
      caretPos = input.selectionStart
    } else {
      input.focus()
      let range = document.selection.createRange()
      range.moveStart('character', -input.value.length)
      caretPos = range.text.length
    }

    // we assume we are in a formula (starting with "=")
    var expr
    try {
      expr = formulaParser.parse(input.value)
    } catch (e) {
      console.log(input.value)
      console.log(e)
      return
    }

    var start, end

    // if expr is null, that means there's only a "="
    if (!expr) {
      start = 1
      end = 1
    } else {
      // we search for the arguments in this formula and nested formulas
      // for a word under our cursor
      let found = searchForOperative(expr, caretPos)
      if (!found) {
        return
      }
      [start, end] = found
    }

    let before = (input.value).slice(0, start)
    let after = (input.value).slice(end)
    input.value = before + this.injected + after

    // emit an event so the app can listen to and update itself
    let event = document.createEvent('Event')
    event.initEvent('raw-update', true, true)
    input.dispatchEvent(event)

    // set the cursor to the right position (after the inserted argument)
    if (isModernBrowser) {
      input.selectionStart = start + this.injected.length
      input.selectionEnd = start + this.injected.length
    } else {
      let range = document.selection.createRange()
      range.moveStart('character', start)
      range.moveEnd('character', end)
      range.select()
    }
    input.focus()
  }
}

function searchForOperative (expr, caret) {
  if (expr.type === 'function') {
    for (let i = 0; i < expr.arguments.length; i++) {
      let result = searchForOperative(expr.arguments[i], caret)
      if (result) {
        return result
      }
    }
  }
  // not a function, so it is a the raw operative (string, int, cell, range)
  if (expr.pos[0] <= caret && caret <= expr.pos[1]) {
    return expr.pos
  }
}
