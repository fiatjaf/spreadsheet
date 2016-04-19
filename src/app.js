import Rx from 'rx'
import extend from 'deep-extend'

import { vrender } from './vrender'
import { intent, modifications } from './intent-and-mods'

export default function app ({
  DOM,
  COPYPASTE,
  INJECT,
  CELLS: cells$,
  STATE: state$ = Rx.Observable.just(null)
    .map(state => extend({areaSelect: {}, handleDrag: {}}, state || {}))
    .shareReplay(1),
  keydown: keydown$,
  keypress: keypress$
}) {
  let actions = intent(DOM, COPYPASTE, INJECT, keydown$, keypress$)

  let mod$ = modifications(actions)
    .share()
    .startWith((state, cells) => ({state, cells}))

  let signal$ = Rx.Observable.combineLatest(
    state$,
    cells$,
    mod$,
    (state, cells, mod) => {
      console.log(mod.name)
      try {
        return mod(state, cells)
      } catch (e) {
        console.error(e.stack)
        return {state, cells}
      }
    }
  )
    .flatMap(({state, cells}) => {
      let o = Rx.Observable.just({state, cells})

      return o.concat(
        o
          .delay(1)
          .map(({state, cells}) => {
            // postpone setting handle
            if (!state.areaSelecting) {
              if (state.areaSelect.start) {
                let last = cells.lastCellInRange(state.areaSelect)
                cells.setHandle(last)
                return {state, cells}
              } else if (state.selected) {
                let last = cells.getByName(state.selected)
                cells.setHandle(last)
                return {state, cells}
              }
            }
            cells.unsetHandle()
            return {state, cells}
          })
          .filter(x => x)
      )
    })
    .share()

  let inject$ = actions.cellMouseUp$
    .withLatestFrom(
      signal$,
      DOM.select('.top.editing input, .cell.dyn.editing input').observable,
      (_, {state, cells}, inputs) => {
        if (state.editing && state.currentInput[0] === '=') {
          return {
            injected: state.inject, // this was prepared by `stopSelectingMod$`
            input: inputs[0]
          }
        }
      }
    )
    .filter(x => x)

  let valuesToCopy$ = COPYPASTE.copying$.merge(COPYPASTE.cutting$)
    .withLatestFrom(
      signal$,
      (_, {state, cells}) => {
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

  let resizerTop = DOM.select('.static.top .resizer')
  let resizerLeft = DOM.select('.static.left .resizer')
  let resizeState$ = Rx.Observable.merge(
    resizerTop.events('mousedown').map(e => ({
      resizing: true,
      type: 'resize-column',
      index: e.ownerTarget.parentNode.dataset.index,
      currentSize: e.ownerTarget.parentNode.offsetWidth,
      startedAt: e.clientX,
      pos: e.ownerTarget.classList.item(1)
    })),
    resizerLeft.events('mousedown').map(e => ({
      resizing: true,
      type: 'resize-row',
      index: e.ownerTarget.parentNode.dataset.index,
      currentSize: e.ownerTarget.parentNode.offsetHeight,
      startedAt: e.clientY,
      pos: e.ownerTarget.classList.item(1)
    })),
    DOM.select('.sheet-container').events('mouseup').map({resizing: false})
  ).startWith({resizing: false})

  let resize$ = DOM.select('.static').events('mousemove')
    .withLatestFrom(
      resizeState$,
      (e, {resizing, type, index, currentSize, startedAt, pos}) => {
        if (!resizing || !document.querySelectorAll('*:active').length) return

        var mod = { type, index, size: 0 }
        var endedAt

        if (type === 'resize-row') endedAt = e.clientY
        else endedAt = e.clientX

        if (pos === 'first') mod.size = currentSize + (startedAt - endedAt)
        else mod.size = currentSize + (endedAt - startedAt)

        if (mod.size <= 20) mod.size = 20
        if (mod.size >= 400) mod.size = 400

        return mod
      }
    )
    .filter(m => m)

  let vtree$ = signal$
    .map(({state, cells}) => vrender.main(state, cells))

  return {
    DOM: vtree$,
    COPYPASTE: valuesToCopy$,
    INJECT: inject$,
    ADAPTWIDTH: DOM.select('.cell.dyn.editing input').observable
      .filter(inputs => inputs.length)
      .map(inputs => inputs[0]),
    CSS: resize$,
    signal$ // this is just useful for other cycle components instantiating this
  }
}
