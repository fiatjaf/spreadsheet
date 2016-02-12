import {Observable} from 'rx'
import {h} from '@cycle/dom'
import keycode from 'keycode'
import document from 'global/document'

import partial from './partial'
import Grid from './grid'
import {FORMULAERROR, CALCERROR, CALCULATING} from './const'
import {ControlledInputHook, InputWidget} from './vdom-utils'

function intent (DOM, COPYPASTE, keydown$, keypress$) {
  let cellClick$ = DOM.select('.cell:not(.editing)').events('click')
  let cellInput$ = DOM.select('.cell.editing input').events('input')
  let cellUpdatedItself$ = DOM.select('.cell.editing input').events('raw-update')
  let topInput$ = DOM.select('.top input').events('input')
  let cellBlur$ = DOM.select('.cell.editing').events('blur')

  let bufferedCellClick$ = cellClick$
    .map(e => e.target.dataset.name)
    .buffer(() => cellClick$.debounce(250))
    .share()

  let cellMouseDown$ = DOM.select('.cell:not(.editing)').events('mousedown')
  let cellMouseEnter$ = DOM.select('.cell:not(.editing)').events('mouseenter')
  let cellMouseUp$ = DOM.select('.cell:not(.editing)').events('mouseup')

  let editingKeydown$ = DOM.select('.cell.editing input').events('keydown')

  // filter only non-character-emitting keydown events
  let nonCharacterKeydown$ = keydown$
    // stop these events now, because after the delay
    // it will be too late.
    .do(e => {
      let keyName = keycode(e)
      if (keyName === 'tab' ||
          keyName === 'up' ||
          keyName === 'down') {
        e.preventDefault()
        e.stopPropagation()
      }
      if (keyName === 'backspace' && e.target.tagName !== 'INPUT') {
        e.preventDefault()
        e.stopPropagation()
      }
    })
    .filter(e => {
      let keyName = keycode(e)
      return keyName !== 'shift' && keyName !== 'ctrl'
    })
    .merge(
      keypress$.filter(e => {
        let code = (e.which || e.keyCode || e.charCode)
        return code !== 13 && code !== 127
      })
    )
    // this ensures all keypresses will emit a buffer
    .buffer(() => keydown$.delay(1))
    // if a character-key was pressed, keypress$ will emit
    // so the buffer will have 2 events, so we can use this
    // to filter out keydowns with keypress attached
    .filter(events => events.length === 1)
    // then go back to the one event stream
    .map(events => events[0])

  return {
    singleCellClick$: bufferedCellClick$
      .filter(names => names.length === 1)
      .map(names => names[0]),
    doubleCellClick$: bufferedCellClick$
      .filter(names => names.length > 1)
      .map(names => names[0]),
    input$: cellInput$
      .merge(topInput$)
      .merge(cellUpdatedItself$)
      .map(e => e.target.value),
    cellBlur$: cellBlur$,
    cellMouseDown$: cellMouseDown$
      .map(e => e.target.dataset.name),
    cellMouseEnter$: cellMouseEnter$
      .map(e => e.target.dataset.name),
    cellMouseUp$: cellMouseUp$
      .map(e => e.target.dataset.name),
    keyCommand$: nonCharacterKeydown$
      .filter(e => e.target.tagName !== 'INPUT')
      .map(e => [keycode(e), e]),
    keyCommandFromInput$: editingKeydown$
      .map(e => [keycode(e), e])
      .filter(([keyName]) =>
        keyName === 'esc' ||
        keyName === 'enter' ||
        keyName === 'tab'
      ),
    charEntered$: keypress$
      .filter(e => {
        let code = (e.which || e.keyCode || e.charCode)
        return code !== 13 && code !== 127
      })
      .map(e => String.fromCharCode(e.which || e.keyCode || e.charCode)),
    afterPaste$: COPYPASTE.pasted$
      .map(input => input.split('\n').map(line => line.split('\t')))
  }
}

function modifications (actions) {
  let selectCellMod$ = actions.singleCellClick$
    .merge(actions.cellMouseDown$)
    .map(cellName => function (state, cells) {
      // unmark the old selected cell
      let old = cells.getByName(state.selected)
      if (old) {
        cells.bumpCell(old.name)
      }

      // unmark the old selected range
      if (state.areaSelect.start) {
        let inRange = cells.getCellsInRange(state.areaSelect)
        cells.bumpCells(inRange.map(c => c.name))
        state.selecting = false
        state.areaSelect = {}
      }

      // do not mark anything if we are currently editing
      if (state.editing) return {state, cells}

      // mark the new cell
      let cell = cells.getByName(cellName)
      state.selected = cell.name
      cells.bumpCell(cell.name)
      return {state, cells}
    })

  let moveSelected$ = actions.keyCommand$
    .map(([keyName, e]) => function (state, cells) {
      if (state.selected && !e.shiftKey) {
        let old = cells.getByName(state.selected)
        var newSelected
        switch (keyName) {
          case 'up':
            newSelected = cells.getNextUp(old)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !old.raw.trim()) {
                let next = cells.getNextUp(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'down':
            newSelected = cells.getNextDown(old)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !old.raw.trim()) {
                let next = cells.getNextDown(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'enter':
            newSelected = cells.getNextDown(old)
            break
          case 'left':
            newSelected = cells.getNextLeft(old)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !old.raw.trim()) {
                let next = cells.getNextLeft(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'right':
            newSelected = cells.getNextRight(old)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !old.raw.trim()) {
                let next = cells.getNextRight(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          default: return {state, cells}
        }
        state.selected = newSelected.name
        cells.bumpCell(old.name)
        cells.bumpCell(newSelected.name)

        // unmark the old selected range
        if (state.areaSelect.start) {
          let inRange = cells.getCellsInRange(state.areaSelect)
          cells.bumpCells(inRange.map(c => c.name))
          state.selecting = false
          state.areaSelect = {}
        }
      }
      return {state, cells}
    })

  let startEditingFromDoubleClickMod$ = actions.doubleCellClick$
    .map(cellName => function (state, cells) {
      // unmark the old selected cell
      let old = cells.getByName(state.selected)
      if (old) {
        state.selected = null
        cells.bumpCell(old.name)
      }

      // unmark the old selected range
      if (state.areaSelect.start) {
        let inRange = cells.getCellsInRange(state.areaSelect)
        cells.bumpCells(inRange.map(c => c.name))
        state.selecting = false
        state.areaSelect = {}
      }

      // mark the new cell as editing
      let cell = cells.getByName(cellName)
      state.editing = cell.name
      state.valueBeforeEdit = cell.raw
      state.currentInput = cell.raw
      cells.bumpCell(cell.name)
      return {state, cells}
    })

  let startEditingFromCharEnteredMod$ = actions.charEntered$
    .map(character => function (state, cells) {
      if (state.selected && !state.editing) {
        let cell = cells.getByName(state.selected)

        // set the cell value and mark it as editing
        state.editing = cell.name
        state.valueBeforeEdit = cell.raw
        cell.raw = character
        state.currentInput = cell.raw
        cells.bumpCell(cell.name)

        // unselect it
        state.selected = null

        // unmark the old selected range
        if (state.areaSelect.start) {
          let inRange = cells.getCellsInRange(state.areaSelect)
          cells.bumpCells(inRange.map(c => c.name))
          state.selecting = false
          state.areaSelect = {}
        }
      }

      return {state, cells}
    })

  let saveCurrentInputMod$ = actions.input$
    .map(val => function (state, cells) {
      state.currentInput = val
      cells.getByName(state.editing).raw = val
      return {state, cells}
    })

  let stopEditingFromBlur$ = actions.cellBlur$
    .map(e => function (state, cells) {
      if (state.currentInput && state.currentInput[0] === '=') {
        // don't stop editing on blur if the current cell
        // being edited is a formula
        return {state, cells}
      }

      // unmark the old selected range
      if (state.areaSelect.start) {
        let inRange = cells.getCellsInRange(state.areaSelect)
        state.selecting = null
        state.areaSelect = {}
        cells.bumpCells(inRange.map(c => c.name))
      }

      if (state.editing) {
        cells.setByName(state.editing, state.currentInput)
        state.editing = null
      }

      state.currentInput = null
      return {state, cells}
    })

  let stopEditingFromEscapeMod$ = actions.keyCommandFromInput$
    .map(([keyName]) => function (state, cells) {
      let cell = cells.getByName(state.editing)
      var next

      if (keyName === 'enter') {
        cells.setByName(state.editing, state.currentInput)
        next = cells.getNextDown(cell).name
      } else if (keyName === 'tab') {
        cells.setByName(state.editing, state.currentInput)
        next = cells.getNextRight(cell).name
      } else if (keyName === 'esc') {
        cells.setByName(state.editing, state.valueBeforeEdit)
        next = state.editing
      }

      state.editing = null
      state.currentInput = null

      cells.bumpCell(next)
      state.selected = next

      return {state, cells}
    })

  let startSelectingMod$ = actions.cellMouseDown$
    .map((cellName) => function (state, cells) {
      // unmark the old selected range
      if (state.areaSelect.start) {
        let inRange = cells.getCellsInRange(state.areaSelect)
        cells.bumpCells(inRange.map(c => c.name))
      }

      let cell = cells.getByName(cellName)
      state.selecting = true
      state.areaSelect = {
        start: cell,
        end: cell
      }
      cells.bumpCell(cell.name)

      return {state, cells}
    })

  let alterSelectionMod$ = actions.cellMouseEnter$
    .map((cellName) => function (state, cells) {
      if (state.selecting) {
        // cancel if the mouse key was released out of the browser window
        let pressed = document.querySelectorAll('*:active')
        if (!pressed.length ||
            pressed[pressed.length - 1].dataset.name !== state.areaSelect.start.name) {
          state.areaSelect = {}
          state.selecting = false
          return {state, cells}
        }

        // set the relevant range
        let cell = cells.getByName(cellName)
        state.areaSelect.end = cell
        cells.bumpAllCells()
      }
      return {state, cells}
    })

  let stopSelectingMod$ = actions.cellMouseUp$
    .map((cellName) => function (state, cells) {
      if (state.editing && state.currentInput[0] === '=') {
        // add selected cell (or range) to input
        let add = state.areaSelect.start
          ? state.areaSelect.start !== state.areaSelect.end
            ? [state.areaSelect.start, state.areaSelect.end]
              .sort()
              .map(cell => cell.name)
              .join(':')
            : state.areaSelect.start.name
          : state.selected
        state.injectArgument = add.toUpperCase()
        cells.bumpCell(state.editing)

        // erase the selection in this special case
        let inRange = cells.getCellsInRange(state.areaSelect)
        cells.bumpCells(inRange.map(c => c.name))
        if (state.selected) cells.bumpCell(state.selected)
        state.selected = null
        state.areaSelect = {}
      }

      state.selecting = false
      return {state, cells}
    })

  let modifySelectionMod$ = actions.keyCommand$
    .map(([keyName, e]) => function (state, cells) {
      if (keyName === 'delete') {
        var toErase = []
        if (state.areaSelect.start) { /* erase cells content everywhere */
          toErase = cells.getCellsInRange(state.areaSelect)
        } else if (state.selected) { /* erase this cell's content */
          toErase = [cells.getByName(state.selected)]
        }
        toErase.forEach(cell => {
          if (cell.raw !== '') cells.setByName(cell.name, '')
          else cells.bumpCell(cell.name)
        })
      } else if (e.shiftKey) {
        // if there's not a selected area, start it now
        if (!state.areaSelect.start && state.selected) {
          let startAt = cells.getByName(state.selected)
          state.areaSelect = {start: startAt, end: startAt}
        }
        let oldRange = cells.getCellsInRange(state.areaSelect)

        var newSelected
        switch (keyName) {
          case 'up':
            newSelected = cells.getNextUp(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !state.areaSelect.end.raw.trim()) {
                let next = cells.getNextUp(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'down':
            newSelected = cells.getNextDown(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !state.areaSelect.end.raw.trim()) {
                let next = cells.getNextDown(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'left':
            newSelected = cells.getNextLeft(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !state.areaSelect.end.raw.trim()) {
                let next = cells.getNextLeft(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'right':
            newSelected = cells.getNextRight(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !state.areaSelect.end.raw.trim()) {
                let next = cells.getNextRight(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          default: return {state, cells}
        }
        state.areaSelect.end = newSelected
        let newRange = cells.getCellsInRange(state.areaSelect)

        // now that we have updated the selected range, refresh all that may have been affected
        cells.bumpCells(oldRange.map(c => c.name))
        cells.bumpCells(newRange.map(c => c.name))
      }
      return {state, cells}
    })

  let getPastedValuesMod$ = actions.afterPaste$
    .map(rows => function (state, cells) {
      // determine where will the paste start
      var startAt
      if (state.areaSelect.start) {
        startAt = cells.getByRowColumn(
          Math.min(state.areaSelect.start.row, state.areaSelect.end.row),
          Math.min(state.areaSelect.start.column, state.areaSelect.end.column)
        )
      } else if (state.selected) {
        startAt = cells.getByName(state.selected)
      } else {
        return {state, cells}
      }

      var cellBeingUpdated = startAt
      var currentRow = startAt
      var next
      for (let r = 0; r < rows.length; r++) {
        let row = rows[r]
        for (let v = 0; v < row.length; v++) {
          let value = row[v]
          cells.setByName(cellBeingUpdated.name, value)
          next = cells.getNextRight(cellBeingUpdated)
          if (cellBeingUpdated === next) break
          cellBeingUpdated = next
        }
        next = cells.getNextDown(currentRow)
        if (currentRow === next) break
        currentRow = next
        cellBeingUpdated = next
      }

      return {state, cells}
    })

  return Observable.merge(
    selectCellMod$,
    moveSelected$,
    startEditingFromDoubleClickMod$,
    startEditingFromCharEnteredMod$,
    saveCurrentInputMod$,
    stopEditingFromBlur$,
    stopEditingFromEscapeMod$,
    startSelectingMod$,
    alterSelectionMod$,
    stopSelectingMod$,
    modifySelectionMod$,
    getPastedValuesMod$
  )
}

export default function app ({
  DOM,
  COPYPASTE,
  keydown: keydown$,
  keypress: keypress$
}) {
  let actions = intent(DOM, COPYPASTE, keydown$, keypress$)

  let mod$ = modifications(actions)
    .startWith((state, cells) => ({state, cells}))

  let cells$ = Observable.empty()
    .share()
    .startWith(new Grid(10, 30))

  let state$ = Observable.empty()
    .share()
    .startWith({areaSelect: {}})

  let valuesToCopy$ = Observable.combineLatest(
    state$,
    cells$,
    COPYPASTE.copying$,
    (state, cells) => {
      // determine where will the copy start
      var startAt
      var endAt
      if (state.areaSelect.start) {
        startAt = cells.getByRowColumn(
          Math.min(state.areaSelect.start.row, state.areaSelect.end.row),
          Math.min(state.areaSelect.start.column, state.areaSelect.end.column)
        )
        endAt = cells.getByRowColumn(
          Math.max(state.areaSelect.start.row, state.areaSelect.end.row),
          Math.max(state.areaSelect.start.column, state.areaSelect.end.column)
        )
      } else if (state.selected) {
        startAt = cells.getByName(state.selected)
        endAt = startAt
      } else {
        return ''
      }

      var rawRows = []
      var calcRows = []
      for (let r = startAt.row; r <= endAt.row; r++) {
        var rawRow = []
        var calcRow = []
        for (let c = startAt.column; c <= endAt.column; c++) {
          let cell = cells.getByRowColumn(r, c)
          rawRow.push(cell.raw)
          calcRow.push(cell.calc)
        }
        rawRows.push(rawRow.join('\t'))
        calcRows.push(calcRow.join('\t'))
      }

      return {
        raw: rawRows.join('\n'),
        calc: calcRows.join('\n')
      }
    }
  )

  let vtree$ = Observable.combineLatest(
    state$,
    cells$,
    mod$,
    (state, cells, mod) => {
      try {
        ({state, cells} = mod(state, cells))
      } catch (e) {
        console.error(e.stack)
      }

      return h('main', [
        thunk.top('__top__', vrender.top, state, cells),
        h('div.sheet', cells.byRowColumn.map((row, i) =>
          thunk.row(i, vrender.row, state, row, cells.rowRev[i])
        ))
      ])
    }
  )

  return {
    DOM: vtree$,
    COPYPASTE: valuesToCopy$
  }
}

const vrender = {
  cell: function (state, cell) {
    var classes = []
    if (state.selected === cell.name) classes.push('selected')
    if (state.areaSelect.start) {
      if (Grid.cellInRange(cell, state.areaSelect)) classes.push('range')
    }
    switch (cell.calc) {
      case CALCULATING:
        classes.push('calculating')
        break
      case CALCERROR:
        classes.push('calcerror')
        break
      case FORMULAERROR:
        classes.push('formulaerror')
        break
    }

    let cn = classes.join(' ')
    let cd = {
      name: cell.name
    }

    if (cell.name !== state.editing) {
      return h('div.cell', {
        className: cn,
        dataset: cd
      }, cell.calc === null ? cell.raw : cell.calc)
    } else {
      var inject
      if (state.injectArgument) {
        inject = state.injectArgument
        delete state.injectArgument
      }

      return h('div.cell.editing', {
        className: cn,
        dataset: cd
      }, [
        new InputWidget(
          typeof state.currentInput === 'string' ? state.currentInput : cell.raw, /* value */
          inject /* selected cell */
        )
      ])
    }
  },
  row: function (state, row) {
    return h('div.row',
      row.map(cell => thunk.cell(cell.name, vrender.cell, state, cell, cell.rev))
    )
  },
  top: function (state, cells) {
    let selected = cells.getByName(state.selected)
    let value = state.currentInput || selected && selected.raw || ''
    return h('div.top', [
      h('input', {
        'input-hook': new ControlledInputHook(value)
      })
    ])
  }
}

const thunk = {
  cell: partial(function ([currState, currCell, currCellRev], [nextState, nextCell, nextCellRev]) {
    return currCellRev === nextCellRev
  }),
  row: partial(function ([currState, currRow, currRowRev], [nextState, nextRow, nextRowRev]) {
    return currRowRev === nextRowRev
  }),
  top: partial(function ([currState], [nextState]) {
    return false
    // return currState.selected === nextState.selected &&
    //   currState.editing === nextState.editing &&
    //   currState.currentInput === nextState.currentInput
  })
}
