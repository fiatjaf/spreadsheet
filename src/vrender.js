import {h} from '@cycle/dom'

import Grid from './grid'
import partial from './partial'
import {ControlledInputHook} from './vdom-utils'
import {FORMULAERROR, CALCERROR, CALCULATING} from './const'

export const vrender = {
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
      return h('div.cell.editing', {
        className: cn,
        dataset: cd
      }, h('input', {
        value: cell.raw
      }))
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

export const thunk = {
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
