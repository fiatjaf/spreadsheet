import {Observable} from 'rx'
import {h} from '@cycle/dom'
import keycode from 'keycode'
import document from 'global/document'

import partial from './partial'
import Grid from './grid'
import {deselect} from './helpers'

function ControlledInputHook (injectedText) {
  this.injectedText = injectedText
}
ControlledInputHook.prototype.hook = function hook (element) {
  element.value = this.injectedText
}

function FocusHook () {}
FocusHook.prototype.hook = function hook (element) {
  deselect()
  setTimeout(() => element.focus(), 1)
}

function intent (DOM, keydown$) {
  let cellClick$ = DOM.select('.cell:not(.editing)').events('click')
  let cellInput$ = DOM.select('.cell.editing input').events('input')
  let topInput$ = DOM.select('.top input').events('input')
  let cellBlur$ = DOM.select('.cell.editing').events('blur')

  let bufferedCellClick$ = cellClick$
    .map(ev => ev.target.dataset.name)
    .buffer(() => cellClick$.debounce(250))
    .share()

  let cellMouseDown$ = DOM.select('.cell:not(.editing)').events('mousedown')
  let cellMouseEnter$ = DOM.select('.cell:not(.editing)').events('mouseenter')
  let cellMouseUp$ = DOM.select('.cell:not(.editing)').events('mouseup')

  let editingKeydown$ = DOM.select('.cell.editing input').events('keydown')

  return {
    singleCellClick$: bufferedCellClick$
      .filter(names => names.length === 1)
      .map(names => names[0]),
    doubleCellClick$: bufferedCellClick$
      .filter(names => names.length > 1)
      .map(names => names[0]),
    input$: cellInput$
      .merge(topInput$)
      .map(ev => ev.target.value),
    cellBlur$: cellBlur$,
    startSelecting$: cellMouseDown$
      .map(ev => ev.target.dataset.name),
    alterSelection$: cellMouseEnter$
      .map(ev => ev.target.dataset.name),
    stopSelecting$: cellMouseUp$
      .map(ev => ev.target.dataset.name),
    keyCommand$: keydown$
      .filter(ev => ev.target.tagName !== 'INPUT')
      .do(ev => ev.preventDefault())
      .do(ev => ev.stopPropagation())
      .map(keycode),
    keyCommandFromInput$: editingKeydown$
      .map(keycode)
      .filter(keyName => keyName === 'esc' || keyName === 'enter')
  }
}

function modifications (actions) {
  let selectCellMod$ = actions.singleCellClick$
    .merge(actions.startSelecting$)
    .map(cellName => function (state, cells) {
      if (state.editing) {
        if (state.currentInput[0] === '=') {
          // add clicked cell to input
          state.currentInput = state.currentInput + cellName.toUpperCase()
          cells.bumpCell(state.editing)
          return {state, cells}
        }
      }

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

      // mark the new cell
      let cell = cells.getByName(cellName)
      state.selected = cell.name
      cells.bumpCell(cell.name)
      return {state, cells}
    })

  let moveSelection$ = actions.keyCommand$
    .map(keyName => function (state, cells) {
      if (state.selected) {
        let old = cells.getByName(state.selected)
        var newSelected
        switch (keyName) {
          case 'up':
            newSelected = cells.getNextUp(old)
            break
          case 'down':
          case 'enter':
            newSelected = cells.getNextDown(old)
            break
          case 'left':
            newSelected = cells.getNextLeft(old)
            break
          case 'right':
          case 'tab':
            newSelected = cells.getNextRight(old)
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

  let markCellEditingMod$ = actions.doubleCellClick$
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

  let saveCurrentInputMod$ = actions.input$
    .map(val => function (state, cells) {
      state.currentInput = val
      cells.getByName(state.editing).raw = val
      return {state, cells}
    })

  let stopEditingFromBlur$ = actions.cellBlur$
    .map(ev => function (state, cells) {
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

      cells.setByName(state.editing, state.currentInput)
      state.editing = null
      state.currentInput = null
      return {state, cells}
    })

  let stopEditingFromEscapeMod$ = actions.keyCommandFromInput$
    .filter(keyName => keyName === 'esc' || keyName === 'enter')
    .map(keyName => function (state, cells) {
      let cell = cells.getByName(state.editing)
      var next

      if (keyName === 'enter') {
        cells.setByName(state.editing, state.currentInput)
        next = cells.getNextDown(cell).name
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

  let startSelectingMod$ = actions.startSelecting$
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

  let alterSelectionMod$ = actions.alterSelection$
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

  let stopSelectingMod$ = actions.stopSelecting$
    .map((cellName) => function (state, cells) {
      state.selecting = false
      return {state, cells}
    })

  return Observable.merge(
    selectCellMod$,
    moveSelection$,
    markCellEditingMod$,
    saveCurrentInputMod$,
    stopEditingFromBlur$,
    stopEditingFromEscapeMod$,
    startSelectingMod$,
    alterSelectionMod$,
    stopSelectingMod$
  )
}

export default function app ({DOM, keydown: keydown$}) {
  let actions = intent(DOM, keydown$)

  let mod$ = modifications(actions)
    .startWith((state, cells) => ({state, cells}))

  let cells$ = Observable.empty()
    .share()
    .startWith(new Grid(10, 30))

  let state$ = Observable.empty()
    .share()
    .startWith({areaSelect: {}})

  let vtree$ = Observable.combineLatest(
    state$,
    cells$,
    mod$,
    (state, cells, mod) => {
      try {
        ({state, cells} = mod(state, cells))
      } catch (e) {
        console.error(e, e.stack)
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
    DOM: vtree$
  }
}

const vrender = {
  cell: function (state, cell) {
    var classes = []
    if (state.selected === cell.name) classes.push('selected')
    if (state.selecting) {
      if (Grid.cellInRange(cell, state.areaSelect)) classes.push('range')
    }

    let cn = classes.join(' ')
    let cd = {
      name: cell.name
    }

    if (cell.name !== state.editing) {
      return h('div.cell', {
        className: cn,
        dataset: cd
      }, cell.calc || cell.raw)
    } else {
      return h('div.cell.editing', {
        className: cn,
        dataset: cd
      }, [
        h('input', {
          value: typeof state.currentInput === 'string' ? state.currentInput : cell.raw,
          'focus-hook': new FocusHook(),
          'input-hook': state.currentInput !== state.valueBeforeEdit ? new ControlledInputHook(state.currentInput) : null
        })
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
