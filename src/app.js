import {Observable} from 'rx'
import {h} from '@cycle/dom'

import Cells from './cells'

function ControlledInputHook (injectedText) {
  this.injectedText = injectedText
}

ControlledInputHook.prototype.hook = function hook (element) {
  if (this.injectedText !== null) {
    element.value = this.injectedText
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
  let cellDblClick$ = DOM.select('.cell:not(.editing)').events('dblclick')

  let enterPressed$ = keydown$.filter(({keyCode}) => keyCode === ENTER_KEYCODE)
  let tabPressed$ = keydown$.filter(({keyCode}) => keyCode === TAB_KEYCODE)
  let clearField$ = input$.filter(ev => ev.target.value.length === 0)
  let inputBlurToItem$ = inputBlur$.let(between(itemMouseDown$, itemMouseUp$))
  let inputBlurToElsewhere$ = inputBlur$.let(notBetween(itemMouseDown$, itemMouseUp$))
  let itemMouseClick$ = itemMouseDown$.flatMapLatest(mousedown =>
    itemMouseUp$.filter(mouseup => mousedown.target === mouseup.target)
  )

  return {
    editCell$: cellDblClick$
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
  let markCellEditingMod$ = actions.editCell$
    .map(cellName => function (state) {
      state.editing = cellName
      return state
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
    markCellEditingMod$,
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

  cells$ = cells$
    .share()
    .startWith(new Cells(3, 3))
    .do(x => console.log('cells', x))

  let mod$ = modifications(actions)
  state$ = state$
    .combineLatest(mod$, (state, mod) => mod(state))
    .share()
    .startWith({})
    .do(x => console.log('state', x))

  let vtree$ = Observable.combineLatest(
    cells$,
    state$,
    (cells, state) =>
      h('main',
        cells.byRowColumn.map(row =>
          h('div.row',
            row.map(cell => {
              let cn = state.selected === cell.name ? 'selected' : ''
              let cd = {
                name: cell.name
              }

              if (cell.name !== state.editing) {
                return h('div.cell', {
                  className: cn,
                  dataset: cd
                }, cell.calc)
              } else {
                return h('div.cell.editing', {
                  className: cn,
                  dataset: cd
                }, [
                  h('input', {value: cell.raw, autofocus: true})
                ])
              }
            })
          )
        )
      )
  )

  let prevented$ = preventedEvents(actions, state$)
  return {
    DOM: vtree$
           .do(x => console.log('cells', x)),
    preventDefault: prevented$
  }
}
