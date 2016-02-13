import formulaParser from '../lib/formula-parser'

module.exports = makeInjectCellDriver

function makeInjectCellDriver () {
  return function (inject$) {
    let updated$ = inject$
      .map(({injected, input}) => {
        let isModernBrowser = (input.selectionStart && input.selectionEnd)

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
        input.value = before + injected + after

        // emit an event so the app can listen to and update itself
        // let event = document.createEvent('Event')
        // event.initEvent('raw-update', true, true)
        // input.dispatchEvent(event)

        // set the cursor to the right position (after the inserted argument)
        if (isModernBrowser) {
          input.selectionStart = start + injected.length
          input.selectionEnd = start + injected.length
        } else {
          let range = document.selection.createRange()
          range.moveStart('character', start)
          range.moveEnd('character', end)
          range.select()
        }
        input.focus()

        // this will be emitted by the driver so the app can update the state of the cell
        return input.value
      })

    return {
      updated$
    }
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
