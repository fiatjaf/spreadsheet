import {h} from '@cycle/dom'

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
    return h('main', [
      vrender.top(state, cells),
      h('div.sheet', cells.byRowColumn.map((row, i) =>
        thunk.row(i, vrender.row, state, row, cells.rowRev[i])
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
  row: function (state, row) {
    return h('div.row',
      row.map(cell => thunk.cell(cell.name, vrender.cell, state, cell, cell.rev))
    )
  },
  cell: function (state, cell) {
    var classes = []

    if (state.selected === cell.name) classes.push('selected')
    if (state.areaSelect.start) {
      if (cellInRange(cell, state.areaSelect)) classes.push('selectArea')
    }
    if (state.handleDrag.length) {
      if (cellInHandleDrag(cell, state.handleDrag)) classes.push('handleArea')
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
      }, [
        cell.calc === null ? cell.raw : cell.calc,
        cell.handle ? h('div.handle', {innerHTML: '&#8203;'}) : null
      ])
    } else {
      let raw = state.currentInput // if this is not set, then it is a bug.
                                   // we cannot simply use `cell.raw` here

      return h('div.cell.editing', {
        className: cn,
        dataset: cd
      }, h('input', {
        value: raw,
        'focus-hook': !state.editingTop ? new FocusHook() : null,
        'value-hook': !state.editingTop ? null : new ValueHook(raw)
      }))
    }
  }
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
  })
}
