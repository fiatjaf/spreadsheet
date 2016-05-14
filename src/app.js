import Rx from 'rx'
import extend from 'deep-extend'

import depGraph from './dep-graph'
import MergeGraph from './merge-graph'
import { vrender } from './vrender'
import { intent, modifications } from './intent-and-mods'
import { cellInRange } from './grid'

export default function app ({
  DOM,
  COPYPASTE,
  INJECT,
  CELLS: cells$,
  STATE: state$,
  CONTEXTMENU,
  UPDATED,
  keydown: keydown$,
  keypress: keypress$
}) {
  // initializing state
  state$ = (state$ || Rx.Observable.just({}))
    .withLatestFrom(cells$, (baseState, cells) => {
      // deal with `.merged` that refers to cell names, changing it to express actual
      // cell objects relationships.
      var mergeGraph = new MergeGraph()
      for (let baseName in baseState.merged) {
        let baseCell = cells.getByName(baseName.toUpperCase())

        mergeGraph.merge(
          baseCell,
          baseState.merged[baseName]
            .map(mn => mn.toUpperCase())
            .map(mergedName => cells.getByName(mergedName))
        )
      }
      delete baseState.merged

      let state = extend({areaSelect: {}, handleDrag: {}, dependencies: {}}, baseState)
      state.mergeGraph = mergeGraph
      return state
    })
    .shareReplay(1)

  /* this is where the real action happens */
  let actions = intent(DOM, COPYPASTE, INJECT, CONTEXTMENU, keydown$, keypress$)

  let mod$ = modifications(actions)
    .share()
    .startWith((state, cells) => ({state, cells}))

  // now we'll have a signal, which contains {state, cells}, i.e., everything that matters.
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
      /* here we can do some delayed jobs that will emit another signal, derived from the current one
         without affecting the responsiveness of the app.
         at least that's what I'm trying to do.
      */
      let o = Rx.Observable.just({state, cells})

      return o.concat(
        o
          // delayed: set that handle (the little box in the corner of the selected cell)
          .delay(1)
          .map(({state, cells}) => {
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
          .filter(x => x),
        o
          // delayed: show cells referenced by the current selected cell
          .delay(1)
          .map(({state, cells}) => {
            // clean dependencies styling
            for (let d in state.dependencies) {
              delete state.dependencies[d]
              cells.bumpCell(cells.getById(d))
            }

            let cellName = state.editing || state.selected
            if (!cellName) return {state, cells}

            // add new dependencies styling
            for (let [depCellId, depCell] of depGraph.dependencies(cells.idFromName(cellName))) {
              state.dependencies[depCellId] = true
              cells.bumpCell(depCell)
            }
            return {state, cells}
          })
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
      id: e.ownerTarget.parentNode.dataset.id,
      currentSize: e.ownerTarget.parentNode.offsetWidth,
      startedAt: e.clientX,
      pos: e.ownerTarget.classList.item(1)
    })),
    resizerLeft.events('mousedown').map(e => ({
      resizing: true,
      type: 'resize-row',
      id: e.ownerTarget.parentNode.dataset.id,
      currentSize: e.ownerTarget.parentNode.offsetHeight,
      startedAt: e.clientY,
      pos: e.ownerTarget.classList.item(1)
    })),
    DOM.select('.sheet-container').events('mouseup').map({resizing: false})
  ).startWith({resizing: false})

  let resize$ = DOM.select('.static').events('mousemove')
    .withLatestFrom(
      resizeState$,
      (e, {resizing, type, id, currentSize, startedAt, pos}) => {
        if (!resizing || !document.querySelectorAll('*:active').length) return

        var mod = { type, id, size: 0 }
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

  let colours$ = Rx.Observable.merge(
    CONTEXTMENU.filter(a => a.tag === 'COLOUR')
      .map(({value}) => ({type: 'color', value})),
    CONTEXTMENU.filter(a => a.tag === 'BACKGROUND')
      .map(({value}) => ({type: 'background-color', value}))
  )
    .withLatestFrom(signal$, (what, {state, cells}) => {
      let mod = {
        type: what.type,
        cells: {}
      }
      cells.getCellsInRange(state.areaSelect)
        .map(c => c.id)
        .concat(cells.getByName(state.selected).id)
        .forEach(cellId => {
          mod.cells[cellId] = { [what.type]: what.value }
        }
      )
      return mod
    })

  let contextMenu$ = Rx.Observable.merge(
    DOM.select('.cell .text').events('contextmenu')
      .withLatestFrom(signal$, (e, {state, cells}) => ({state, cells, e, tag: 'CELL'}))
      .filter(({state, cells, e}) =>
        e.ownerTarget.parentNode.dataset.name === state.selected ||
        cellInRange(cells.getByName(e.ownerTarget.parentNode.dataset.name), state.areaSelect)
      )
      .do(({e}) => e.preventDefault()),
    DOM.select('.cell.static').events('contextmenu')
      .withLatestFrom(signal$, (e, {state, cells}) => ({state, cells, e, tag: 'HEADER'}))
      .do(({e}) => e.preventDefault())
  )

  signal$ = signal$.combineLatest(UPDATED, signal => signal)

  let vtree$ = signal$
    .map(({state, cells}) => vrender.main(state, cells))

  return {
    DOM: vtree$,
    COPYPASTE: valuesToCopy$,
    INJECT: inject$,
    ADAPTWIDTH: DOM.select('.cell.dyn.editing input').observable
      .filter(inputs => inputs.length)
      .map(inputs => inputs[0]),
    CONTEXTMENU: contextMenu$,
    CSS: Rx.Observable.merge(resize$, colours$),
    signal$ // this is just useful for other cycle components instantiating this
  }
}
