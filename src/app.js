import {Observable} from 'rx'
import {h} from '@cycle/dom'

import partial from './partial'
import Cells from './cells'

function ControlledInputHook (injectedText) {
  this.injectedText = injectedText
}

ControlledInputHook.prototype.hook = function hook (element) {
  if (this.injectedText !== null) {
    element.value = this.injectedText
  }
}

class FocusHook {
  hook (element) {
    (function deselect () {
      let selection = ('getSelection' in window)
        ? window.getSelection()
        : ('selection' in document)
          ? document.selection
          : null
      if ('removeAllRanges' in selection) selection.removeAllRanges()
      else if ('empty' in selection) selection.empty()
    })()

    element.focus()
  }
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
  let cellDblClick$ = DOM.select('.cell:not(.editing)').events('dblclick')
  let cellInput$ = DOM.select('.cell.editing input').events('input')
  let cellBlur$ = DOM.select('.cell.editing input').events('blur')

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
    selectCell$: cellClick$
      .map(ev => ev.target.dataset.name),
    editCell$: cellDblClick$
      .map(ev => ev.target.dataset.name),
    cellInput$: cellInput$
      .map(ev => ev.target.value),
    stopEdit$: cellBlur$,
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
  let selectCellMod$ = actions.selectCell$
    .map(cellName => function (state, cells) {
      // unmark the old selected cell
      let old = cells.getByName(state.selected)
      if (old) {
        cells.bumpRowRev(old.row)
        cells.bumpColumnRev(old.column)
        cells.bumpCellRev(old.name)
      }

      // mark the new cell
      let cell = cells.getByName(cellName)
      state.selected = cell.name
      cells.bumpRowRev(cell.row)
      cells.bumpColumnRev(cell.column)
      cells.bumpCellRev(cell.name)
      return {state, cells}
    })

  let markCellEditingMod$ = actions.editCell$
    .map(cellName => function (state, cells) {
      let cell = cells.getByName(cellName)

      state.editing = cellName
      cells.bumpRowRev(cell.row)
      cells.bumpColumnRev(cell.column)
      cells.bumpCellRev(cell.name)
      return {state, cells}
    })

  let saveCurrentInputMod$ = actions.cellInput$
    .map(val => function (state, cells) {
      state.currentInput = val
      return {state, cells}
    })

  let markNoneEditingMod$ = actions.stopEdit$
    .map(() => function (state, cells) {
      let cell = cells.getByName(state.editing)

      cells.setByRowColumn(cell.row, cell.column, state.currentInput)
      state.editing = null
      state.currentInput = null
      cells.bumpRowRev(cell.row)
      cells.bumpColumnRev(cell.column)
      cells.bumpCellRev(cell.name)
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

export default function app ({DOM, cells$, state$}) {
  let actions = intent(DOM)

  let mod$ = modifications(actions)
    .startWith((state, cells) => ({state, cells}))

  cells$ = cells$
    .share()
    .startWith(new Cells(3, 3))

  state$ = state$
    .share()
    .startWith({})

  let vtree$ = Observable.combineLatest(
    state$,
    cells$,
    mod$,
    (state, cells, mod) => {
      ({state, cells} = mod(state, cells))

      return h('main',
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
    let cn = state.selected === cell.name ? 'selected' : ''
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
          'data-hook': new FocusHook()
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
    // return !(
    //  // this cell is taking part on the edit
    //  (
    //   (nextState.editing !== currCell.name || currState.editing !== currCell.name) &&
    //   currState.editing === nextState.editing
    //  ) ||
    //  (
    //   (nextState.selected !== currCell.name || currState.selected !== currCell.name) &&
    //   currState.selected === nextState.selected
    //  ) ||
    //   // or no edit is happening but its display value has changed
    //   (currCell.calc || currCell.raw) === (nextCell.calc || nextCell.raw)
    // )
  }),
  row: partial(function ([currState, currRow, currRowRev], [nextState, nextRow, nextRowRev]) {
    return currRowRev === nextRowRev
  })
}
