import {Observable} from 'rx'
import {h} from '@cycle/dom'

import State from './state-factory'

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

  let enterPressed$ = keydown$.filter(({keyCode}) => keyCode === ENTER_KEYCODE)
  let tabPressed$ = keydown$.filter(({keyCode}) => keyCode === TAB_KEYCODE)
  let clearField$ = input$.filter(ev => ev.target.value.length === 0)
  let inputBlurToItem$ = inputBlur$.let(between(itemMouseDown$, itemMouseUp$))
  let inputBlurToElsewhere$ = inputBlur$.let(notBetween(itemMouseDown$, itemMouseUp$))
  let itemMouseClick$ = itemMouseDown$.flatMapLatest(mousedown =>
    itemMouseUp$.filter(mouseup => mousedown.target === mouseup.target)
  )

  return {
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
    moveHighlightMod$, setHighlightMod$, selectHighlightedMod$, hideMod$
  )
}

function model (suggestionsFromResponse$, actions) {
  const mod$ = modifications(actions)

  const state$ = suggestionsFromResponse$
    .withLatestFrom(actions.wantsSuggestions$,
      (suggestions, accepted) => accepted ? suggestions : []
    )
    .startWith([])
    .map(suggestions => new State({suggestions, highlighted: null, selected: null}))
    .flatMapLatest(state => mod$.startWith(state).scan((acc, mod) => mod(acc)))
    .share()

  return state$
}

function view (state$) {
  return state$.map(state => {
    let suggestions = state.get('suggestions')
    let selected = state.get('selected')
    return (
      h('div.container', [
        h('section', [
          h('label.search-label', 'Query:'),
          h('span.combo-box', [
            h('input.autocompleteable', {
              type: 'text',
              'data-hook': new ControlledInputHook(selected)}
            ),
            suggestions.length === 0 ? null : h('ul.autocomplete-menu',
              suggestions.map((suggestion, index) =>
                h('li.autocomplete-item', {attributes: {'data-index': index}},
                  suggestion
                )
              )
            )
          ])
        ])
      ])
    )
  })
}

const BASE_URL = 'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search='

const networking = {
  processResponses (JSONP) {
    return JSONP.filter(res$ => res$.request.indexOf(BASE_URL) === 0)
      .switch()
      .map(res => res[1])
  },

  generateRequests (searchQuery$) {
    return searchQuery$.map(q => BASE_URL + encodeURI(q))
  }
}

function preventedEvents (actions, state$) {
  return actions.keepFocusOnInput$
    .withLatestFrom(state$, (event, state) => {
      if (state.get('suggestions').length > 0 && state.get('highlighted') !== null) {
        return event
      } else {
        return null
      }
    })
    .filter(ev => ev !== null)
}

export default function app (responses) {
  let suggestionsFromResponse$ = networking.processResponses(responses.JSONP)
  let actions = intent(responses.DOM)
  let state$ = model(suggestionsFromResponse$, actions)
  let vtree$ = view(state$)
  let prevented$ = preventedEvents(actions, state$)
  let searchRequest$ = networking.generateRequests(actions.search$)
  return {
    DOM: vtree$,
    preventDefault: prevented$,
    JSONP: searchRequest$
  }
}
