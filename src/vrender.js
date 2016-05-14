import {h} from '@cycle/dom'
import cx from 'class-set'
import rangegen from 'rangegen'

import { cellInRange } from './grid'
import { cellInHandleDrag } from './handle-drag'
import partial from './partial'
import {FORMULAERROR, CALCERROR, CALCULATING} from './const'
import {deselect} from './helpers'

function ValueHook (text) { this.text = text }
ValueHook.prototype.hook = function hook (element) {
  element.value = this.text
}

function FocusHook () {}
FocusHook.prototype.hook = function hook (element) {
  deselect()
  setTimeout(() => element.focus(), 1)
}

export const vrender = {
  main: function (state, cells) {
    return h('main.sheet-container', [
      vrender.top(state, cells),
      h('table.sheet', [
        thunk.rowStatic('_', vrender.rowStatic, cells.numColumns())
      ].concat(
        cells.byRowColumn.map((row, i) =>
          thunk.row(i, vrender.row, state, row, cells.rowRev[i], i, cells)
        )
      ))
    ])
  },
  top: function (state, cells) {
    let selected = cells.getByName(state.selected)
    let value = state.currentInput || selected && selected.raw || ''
    return h('div.top', {className: state.editingTop ? 'editing' : ''}, [
      h('input', {
        'input-hook': state.editingTop ? null : new ValueHook(value)
      })
    ])
  },
  row: function (state, row, _, rowIndex, cells) {
    return h('tr.row', [vrender.cellStatic(rowIndex + 1, 'left', rowIndex + 1)].concat(
      row.map(cell => thunk.cell(cell.name, vrender.cell, state, cell, cell.rev, cells))
    ))
  },
  cell: function (state, cell, _, cells) {
    var mergedIn = state.mergeGraph.mergedIn(cell.id)
    var mergedOver = state.mergeGraph.mergedOver(cell.id)
    var spans = state.mergeGraph.spans(cell, mergedOver)

    let props = {
      className: cx({
        'selected': state.selected === cell.name,
        'selectArea': state.areaSelect.start && cellInRange(cell, state.areaSelect),
        'handleArea': state.handleDrag.length && cellInHandleDrag(cell, state.handleDrag),
        'merged': mergedIn,
        'formulaerror': cell.calc === FORMULAERROR,
        'calcerror': cell.calc === CALCERROR,
        'calculating': cell.calc === CALCULATING,
        'dependency': cell.name in state.dependencies
      }, `cell-id-${cell.id}`),
      dataset: {
        name: mergedIn && mergedIn.name || cell.name,
        id: cell.id
      },
      rowSpan: spans.row,
      colSpan: spans.col,
      key: cell.id
    }

    if (cell.name !== state.editing) {
      return h('td.cell.dyn', props, [
        h('div.text', (cell.calc === null ? cell.raw : cell.calc).toString()),
        cell.handle ? h('.handle', {innerHTML: '&#8203;'}) : null
      ])
    } else {
      let raw = state.currentInput // if this is not set, then it is a bug.
                                   // we cannot simply use `cell.raw` here

      return h('td.cell.dyn.editing', props, h('input', {
        value: raw,
        'focus-hook': !state.editingTop ? new FocusHook() : null,
        'value-hook': !state.editingTop ? null : new ValueHook(raw)
      }))
    }
  },
  rowStatic: (ncolumns) => {
    var cells = [vrender.cellStatic('', 'top left', 0)]
    for (let i = 1; i < ncolumns + 1; i++) {
      cells.push(vrender.cellStatic(
        rangegen.enc(i - 1, false),
        'top',
        i
      ))
    }
    return h('tr.row.static', cells)
  },
  cellStatic: (label, location, index) =>
    h('td.cell.static', {
      key: label,
      className: location,
      dataset: {index: index + 1}
    }, [
      h('span.resizer.first', '|'),
      label,
      h('span.resizer.last', '|')
    ])
}

export const thunk = {
  top: partial(function ([currState], [nextState]) {
    return false
  }),
  row: partial(function ([currState, currRow, currRowRev], [nextState, nextRow, nextRowRev]) {
    return currRowRev === nextRowRev
  }),
  cell: partial(function ([currState, currCell, currCellRev], [nextState, nextCell, nextCellRev]) {
    return currCellRev === nextCellRev
  }),
  rowStatic: partial(([ncolumns], [ncolumnsBefore]) => ncolumns === ncolumnsBefore)
}
