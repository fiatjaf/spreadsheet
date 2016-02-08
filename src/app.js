import {Observable} from 'rx'
import {h} from '@cycle/dom'
import document from 'global/document'

import partial from './partial'
import Grid from './grid'
import {deselect} from './helpers'

function ControlledInputHook (injectedText) {
  this.injectedText = injectedText
}
ControlledInputHook.prototype.hook = function hook (element) {
  element.value = this.injectedText
  setTimeout(() => element.focus(), 1)
}

function FocusHook () {}
FocusHook.prototype.hook = function hook (element) {
  deselect()
  setTimeout(() => element.focus(), 1)
}

function between (first, second) {
  return (source) => source.window(first, () => second).switch()
}

function notBetween (first, second) {
  return source => Observable.merge(
    source.takeUntil(first),
    first.flatMapLatest(() => source.skipUntil(second))
  )
}

function intent (DOM) {
  let cellClick$ = DOM.select('.cell:not(.editing)').events('click')
  let cellInput$ = DOM.select('.cell.editing input').events('input')
  let cellBlur$ = DOM.select('.sheet').events('blur')

  let bufferedCellClick$ = cellClick$
    .map(ev => ev.target.dataset.name)
    .buffer(() => cellClick$.debounce(250))
    .share()

  let cellMouseDown$ = DOM.select('.cell:not(.editing)').events('mousedown')
  let cellMouseEnter$ = DOM.select('.cell:not(.editing)').events('mouseenter')
  let cellMouseUp$ = DOM.select('.cell:not(.editing)').events('mouseup')

  let UP_KEYCODE = 38
  let DOWN_KEYCODE = 40
  let ENTER_KEYCODE = 13
  let TAB_KEYCODE = 9

  let input$ = DOM.select('.autocompleteable').events('input')
  let keydown$ = DOM.select('.autocompleteable').events('keydown')
  let itemHover$ = DOM.select('.autocomplete-item').events('mouseenter')
  let itemMouseDown$ = DOM.select('.autocomplete-item').events('mousedown')
  let itemMouseUp$ = DOM.select('.autocomplete-item').events('mouseup')
  let inputFocus$ = DOM.select('.autocompleteable').events('focus')
  let inputBlur$ = DOM.select('.autocompleteable').events('blur')

  let enterPressed$ = keydown$.filter(({keyCode}) => keyCode === ENTER_KEYCODE)
  let tabPressed$ = keydown$.filter(({keyCode}) => keyCode === TAB_KEYCODE)
  let clearField$ = input$.filter(ev => ev.target.value.length === 0)
  let inputBlurToItem$ = inputBlur$.let(between(itemMouseDown$, itemMouseUp$))
  let inputBlurToElsewhere$ = inputBlur$.let(notBetween(itemMouseDown$, itemMouseUp$))
  let itemMouseClick$ = itemMouseDown$.flatMapLatest(mousedown =>
    itemMouseUp$.filter(mouseup => mousedown.target === mouseup.target)
  )

  return {
    singleCellClick$: bufferedCellClick$
      .filter(names => names.length === 1)
      .map(names => names[0]),
    doubleCellClick$: bufferedCellClick$
      .filter(names => names.length > 1)
      .map(names => names[0]),
    cellInput$: cellInput$
      .map(ev => ev.target.value),
    cellBlur$: cellBlur$,
    startSelecting$: cellMouseDown$
      .map(ev => ev.target.dataset.name),
    alterSelection$: cellMouseEnter$
      .map(ev => ev.target.dataset.name),
    stopSelecting$: cellMouseUp$
      .map(ev => ev.target.dataset.name),
    search$: input$
      .debounce(500)
      .let(between(inputFocus$, inputBlur$))
      .map(ev => ev.target.value)
      .filter(query => query.length > 0),
    moveHighlight$: keydown$
      .map(({keyCode}) => {
        switch (keyCode) {
          case UP_KEYCODE: return -1
          case DOWN_KEYCODE: return +1
          default: return 0
        }
      })
      .filter(delta => delta !== 0),
    setHighlight$: itemHover$
      .map(ev => parseInt(ev.target.dataset.index, 10)),
    keepFocusOnInput$: Observable
      .merge(inputBlurToItem$, enterPressed$, tabPressed$),
    selectHighlighted$: Observable
      .merge(itemMouseClick$, enterPressed$, tabPressed$),
    wantsSuggestions$: Observable.merge(
      inputFocus$.map(() => true),
      inputBlur$.map(() => false)
    ),
    quitAutocomplete$: Observable
      .merge(clearField$, inputBlurToElsewhere$)
  }
}

function modifications (actions) {
  let selectCellMod$ = actions.singleCellClick$
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

  let markCellEditingMod$ = actions.doubleCellClick$
    .map(cellName => function (state, cells) {
      // unmark the old selected cell
      let old = cells.getByName(state.selected)
      if (old) {
        state.selected = null
        cells.bumpCell(old.name)
      }

      // unmark the old selected range
      if (state.selecting) {
        let cells = cells.getCellsInRange(state.areaSelect)
        cells.bumpCells(cells.map(c => c.name))
        state.selecting = false
        state.areaSelect = {}
      }

      // mark the new cell as editing
      let cell = cells.getByName(cellName)
      state.editing = cell.name
      state.currentInput = cell.raw
      cells.bumpCell(cell.name)
      return {state, cells}
    })

  let saveCurrentInputMod$ = actions.cellInput$
    .map(val => function (state, cells) {
      let cell = cells.getByName(state.editing)
      cell.raw = val
      state.currentInput = val
      return {state, cells}
    })

  let markNoneEditingMod$ = actions.cellBlur$
    .map(ev => function (state, cells) {
      if (state.currentInput && state.currentInput[0] === '=') {
        // don't stop editing on blur if the current cell
        // being edited is a formula
        return {state, cells}
      }

      let cell = cells.getByName(state.editing)

      if (cell && cell.raw !== state.currentInput) {
        cells.setByRowColumn(cell.row, cell.column, state.currentInput)
      }
      state.editing = null
      state.currentInput = null
      cells.bumpCell(cell.name)
      return {state, cells}
    })

  let startSelectingMod$ = actions.startSelecting$
    .map((cellName) => function (state, cells) {
      // unmark the old selected range
      if (state.selecting) {
        let cells = cells.getCellsInRange(state.areaSelect)
        cells.bumpCells(cells.map(c => c.name))
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

  let moveHighlightMod$ = actions.moveHighlight$
    .map(delta => function (state) {
      let suggestions = state.get('suggestions')
      let wrapAround = x => (x + suggestions.length) % suggestions.length
      return state.set('highlighted', highlighted => {
        if (highlighted === null) {
          return wrapAround(Math.min(delta, 0))
        } else {
          return wrapAround(highlighted + delta)
        }
      })
    })

  let setHighlightMod$ = actions.setHighlight$
    .map(highlighted => function (state) {
      return state.set('highlighted', highlighted)
    })

  let selectHighlightedMod$ = actions.selectHighlighted$
    .flatMap(() => Observable.from([true, false]))
    .map(selected => function (state) {
      let suggestions = state.get('suggestions')
      let highlighted = state.get('highlighted')
      let hasHighlight = highlighted !== null
      let isMenuEmpty = suggestions.length === 0
      if (selected && hasHighlight && !isMenuEmpty) {
        return state
          .set('selected', suggestions[highlighted])
          .set('suggestions', [])
      } else {
        return state.set('selected', null)
      }
    })

  let hideMod$ = actions.quitAutocomplete$
    .map(() => function (state) {
      return state.set('suggestions', [])
    })

  return Observable.merge(
    selectCellMod$,
    markCellEditingMod$,
    saveCurrentInputMod$,
    markNoneEditingMod$,
    startSelectingMod$,
    alterSelectionMod$,
    stopSelectingMod$,

    moveHighlightMod$,
    setHighlightMod$,
    selectHighlightedMod$,
    hideMod$
  )
}

function preventedEvents (actions, state$) {
  return actions.keepFocusOnInput$
    .withLatestFrom(state$, (event, state) => {
      return event
    })
    .filter(ev => ev !== null)
}

export default function app ({DOM}) {
  let actions = intent(DOM)

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
      ({state, cells} = mod(state, cells))

      return h('main.sheet',
        cells.byRowColumn.map((row, i) =>
          thunk.row(i, vrender.row, state, row, cells.rowRev[i])
        )
      )
    }
  )

  let prevented$ = preventedEvents(actions, state$)
  return {
    DOM: vtree$,
    preventDefault: prevented$
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
          'data-hook': state.currentInput && state.currentInput !== cell.raw ? new ControlledInputHook(state.currentInput) : new FocusHook()
        })
      ])
    }
  },
  row: function (state, row) {
    return h('div.row',
      row.map(cell => thunk.cell(cell.name, vrender.cell, state, cell, cell.rev))
    )
  }
}

const thunk = {
  cell: partial(function ([currState, currCell, currCellRev], [nextState, nextCell, nextCellRev]) {
    return currCellRev === nextCellRev
  }),
  row: partial(function ([currState, currRow, currRowRev], [nextState, nextRow, nextRowRev]) {
    return currRowRev === nextRowRev
  })
}
