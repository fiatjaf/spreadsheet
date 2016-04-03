import Rx from 'rx'
import keycode from 'keycode'
import extend from 'deep-extend'

import Grid from './grid'
import {vrender} from './vrender'

function intent (DOM, COPYPASTE, INJECT, keydown$, keypress$) {
  let cellClick$ = DOM.select('.cell:not(.editing)').events('click')
  let cellInput$ = DOM.select('.cell.editing input').events('input')
  let cellBlur$ = DOM.select('.cell.editing').events('blur')

  let bufferedCellClick$ = cellClick$
    .map(e => e.ownerTarget.dataset.name)
    .buffer(() => cellClick$.debounce(250))
    .share()

  let topInput$ = DOM.select('.top input').events('input')
  let topClick$ = DOM.select('.top input').events('click')
  let topBlur$ = DOM.select('.top input').events('blur')

  let cellMouseDown$ = DOM.select('.cell:not(.editing)').events('mousedown')
  let cellMouseEnter$ = DOM.select('.cell:not(.editing)').events('mouseenter')
  let cellMouseUp$ = DOM.select('.cell:not(.editing)').events('mouseup')

  let editingKeydown$ = DOM.select('.cell.editing input').events('keydown')

  // filter only non-character-emitting keydown events
  let nonCharacterKeydown$ = keydown$
    // stop these events now, because after the delay
    // it will be too late.
    .do(e => {
      let keyName = keycode(e)
      if (keyName === 'tab' ||
          keyName === 'up' ||
          keyName === 'down') {
        e.preventDefault()
        e.stopPropagation()
      }
      if (keyName === 'backspace' && e.target.tagName !== 'INPUT') {
        e.preventDefault()
        e.stopPropagation()
      }
    })
    .filter(e => {
      let keyName = keycode(e)
      return keyName !== 'shift' && keyName !== 'ctrl'
    })
    .merge(
      keypress$.filter(e => {
        let code = (e.which || e.keyCode || e.charCode)
        return code !== 13 && code !== 127
      })
    )
    // this ensures all keypresses will emit a buffer
    .buffer(() => keydown$.delay(1))
    // if a character-key was pressed, keypress$ will emit
    // so the buffer will have 2 events, so we can use this
    // to filter out keydowns with keypress attached
    .filter(events => events.length === 1)
    // then go back to the one event stream
    .map(events => events[0])

  let keyCommand$ = nonCharacterKeydown$
    .filter(e => e.target.tagName !== 'INPUT')
    .map(e => [keycode(e), e])

  return {
    singleCellClick$: bufferedCellClick$
      .filter(names => names.length === 1)
      .map(names => names[0]),
    doubleCellClick$: bufferedCellClick$
      .filter(names => names.length > 1)
      .map(names => names[0]),
    topClick$,
    topBlur$,
    topInput$: topInput$
      .map(e => e.ownerTarget.value),
    input$: cellInput$
      .map(e => e.ownerTarget.value),
    injected$: INJECT.updated$,
    cellBlur$,
    cellMouseDown$: cellMouseDown$
      .map(e => e.ownerTarget.dataset.name),
    cellMouseEnter$: cellMouseEnter$
      .map(e => e.ownerTarget.dataset.name),
    cellMouseUp$: cellMouseUp$
      .map(e => e.ownerTarget.dataset.name),
    modifySelection$: keyCommand$
      .filter(([_, e]) => e.shiftKey),
    keyCommandFromInput$: editingKeydown$
      .map(e => [keycode(e), e]),
    keyCommandNotFromInput$: keyCommand$,
    eraseSelection$: Rx.Observable.merge(
      keyCommand$.filter(([keyName, _]) => keyName === 'delete'),
      COPYPASTE.cutting$
    ),
    charEntered$: keypress$
      .filter(e => {
        let code = (e.which || e.keyCode || e.charCode)
        return code !== 13 && code !== 127
      })
      .map(e => String.fromCharCode(e.which || e.keyCode || e.charCode)),
    afterPaste$: COPYPASTE.pasted$
      .map(input => input.split('\n').map(line => line.split('\t')))
  }
}

function modifications (actions) {
  return Rx.Observable.merge(
    actions.singleCellClick$
      .merge(actions.cellMouseDown$)
      .map(cellName => function selectCellMod (state, cells) {
        // unmark the old selected cell
        let old = cells.getByName(state.selected)
        if (old) {
          cells.bumpCell(old)
        }

        // unmark the old selected range
        if (state.areaSelect.start) {
          let inRange = cells.getCellsInRange(state.areaSelect)
          cells.bumpCells(inRange)
          state.selecting = false
          state.areaSelect = {}
        }

        // do not mark anything if we are currently editing
        if (state.editing) return {state, cells}

        // mark the new cell
        let cell = cells.getByName(cellName)
        state.selected = cell.name
        cells.bumpCell(cell)
        return {state, cells}
      }),

    actions.keyCommandNotFromInput$
      .map(([keyName, e]) => function moveSelectedMod (state, cells) {
        if (state.selected && !e.shiftKey) {
          let old = cells.getByName(state.selected)
          var newSelected
          switch (keyName) {
            case 'up':
              newSelected = cells.getNextUp(old)
              if (e.ctrlKey) {
                while (!newSelected.raw.trim() === !old.raw.trim()) {
                  let next = cells.getNextUp(newSelected)
                  if (newSelected === next) break
                  newSelected = next
                }
              }
              break
            case 'down':
              newSelected = cells.getNextDown(old)
              if (e.ctrlKey) {
                while (!newSelected.raw.trim() === !old.raw.trim()) {
                  let next = cells.getNextDown(newSelected)
                  if (newSelected === next) break
                  newSelected = next
                }
              }
              break
            case 'enter':
              newSelected = cells.getNextDown(old)
              break
            case 'left':
              newSelected = cells.getNextLeft(old)
              if (e.ctrlKey) {
                while (!newSelected.raw.trim() === !old.raw.trim()) {
                  let next = cells.getNextLeft(newSelected)
                  if (newSelected === next) break
                  newSelected = next
                }
              }
              break
            case 'right':
              newSelected = cells.getNextRight(old)
              if (e.ctrlKey) {
                while (!newSelected.raw.trim() === !old.raw.trim()) {
                  let next = cells.getNextRight(newSelected)
                  if (newSelected === next) break
                  newSelected = next
                }
              }
              break
            case 'tab':
              newSelected = cells.getNextRight(old)
              if (newSelected === old) {
                let lineDown = cells.getNextDown(old)
                if (lineDown !== old) {
                  newSelected = cells.getByRowColumn(lineDown.row, 0)
                }
              }
              break
            default: return {state, cells}
          }
          state.selected = newSelected.name
          cells.bumpCell(old)
          cells.bumpCell(newSelected)

          // unmark the old selected range
          if (state.areaSelect.start) {
            let inRange = cells.getCellsInRange(state.areaSelect)
            cells.bumpCells(inRange)
            state.selecting = false
            state.areaSelect = {}
          }
        }
        return {state, cells}
      }),

    actions.doubleCellClick$
      .map(cellName => function startEditingFromDoubleClickMod (state, cells) {
        // unmark the old selected cell
        let old = cells.getByName(state.selected)
        if (old) {
          state.selected = null
          cells.bumpCell(old)
        }

        // unmark the old selected range
        if (state.areaSelect.start) {
          let inRange = cells.getCellsInRange(state.areaSelect)
          cells.bumpCells(inRange)
          state.selecting = false
          state.areaSelect = {}
        }

        // mark the new cell as editing
        let cell = cells.getByName(cellName)
        state.editing = cell.name
        state.editingTop = false
        state.valueBeforeEdit = cell.raw
        state.currentInput = cell.raw
        cells.bumpCell(cell)
        return {state, cells}
      }),

    actions.charEntered$
      .map(character => function startEditingFromCharEnteredMod (state, cells) {
        if (state.selected && !state.editing) {
          let cell = cells.getByName(state.selected)

          // set the cell value and mark it as editing
          state.editing = cell.name
          state.editingTop = false
          state.valueBeforeEdit = cell.raw
          cell.raw = character
          state.currentInput = cell.raw
          cells.bumpCell(cell)

          // unselect it
          state.selected = null

          // unmark the old selected range
          if (state.areaSelect.start) {
            let inRange = cells.getCellsInRange(state.areaSelect)
            cells.bumpCells(inRange)
            state.selecting = false
            state.areaSelect = {}
          }
        }

        return {state, cells}
      }),

    actions.topClick$
      .map(() => function (state, cells) {
        if (!state.selected) state.selected = state.editing || 'a1'

        let cell = cells.getByName(state.selected)

        // set the cell value and mark it as editing
        state.editing = cell.name
        state.editingTop = true // editing at the top

        state.valueBeforeEdit = cell.raw
        state.currentInput = cell.raw
        cells.bumpCell(cell)

        // unselect it
        state.selected = null

        // unmark the old selected range
        if (state.areaSelect.start) {
          let inRange = cells.getCellsInRange(state.areaSelect)
          cells.bumpCells(inRange)
          state.selecting = false
          state.areaSelect = {}
        }

        return {state, cells}
      }),

    actions.input$
      .merge(actions.topInput$)
      .merge(actions.injected$)
      .map(val => function saveCurrentInputMod (state, cells) {
        state.currentInput = val
        cells.getByName(state.editing).raw = val
        return {state, cells}
      }),

    actions.topInput$
      .merge(actions.injected$)
      .map(val => function updateCellWhenEditingTopMod (state, cells) {
        // this happens in addition to saveCurrentInputMod,
        // so we don't have to repeat what is done there.
        if (state.editingTop) cells.bumpCellByName(state.editing)
        return {state, cells}
      }),

    actions.cellBlur$
      .merge(actions.topBlur$)
      .map(e => function stopEditingFromBlur (state, cells) {
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
          cells.bumpCells(inRange)
        }

        if (state.editing) {
          cells.setByName(state.editing, state.currentInput)
          state.editing = null
          state.editingTop = false
        }

        state.currentInput = null
        return {state, cells}
      }),

    actions.keyCommandFromInput$
      .map(([keyName]) => function changeEditingStateMod (state, cells) {
        let cell = cells.getByName(state.editing)
        var next

        switch (keyName) {
          case 'enter':
            cells.setByName(state.editing, state.currentInput)
            next = cells.getNextDown(cell)
            break
          case 'tab':
            cells.setByName(state.editing, state.currentInput)
            next = cells.getNextRight(cell)
            break
          case 'up':
            cells.setByName(state.editing, state.currentInput)
            next = cells.getNextUp(cell)
            break
          case 'down':
            cells.setByName(state.editing, state.currentInput)
            next = cells.getNextDown(cell)
            break
          case 'esc':
            cells.setByName(state.editing, state.valueBeforeEdit)
            next = cells.getByName(state.editing)
            break
          default: return {state, cells}
        }

        state.editing = null
        state.currentInput = null

        cells.bumpCell(next)
        state.selected = next.name

        return {state, cells}
      }),

    actions.cellMouseDown$
      .map((cellName) => function startSelectingMod (state, cells) {
        // unmark the old selected range
        if (state.areaSelect.start) {
          let inRange = cells.getCellsInRange(state.areaSelect)
          cells.bumpCells(inRange)
        }

        let cell = cells.getByName(cellName)
        state.selecting = true
        state.areaSelect = {
          start: cell,
          end: cell
        }
        cells.bumpCell(cell)

        return {state, cells}
      }),

    actions.cellMouseEnter$
      .map((cellName) => function alterSelectionMod (state, cells) {
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
      }),

    actions.cellMouseUp$
      .map((cellName) => function stopSelectingMod (state, cells) {
        if (state.editing && state.currentInput[0] === '=') {
          // prepare to inject selected cell (or range) to input
          let add = state.areaSelect.start
            ? state.areaSelect.start !== state.areaSelect.end
              ? [state.areaSelect.start, state.areaSelect.end]
                .sort()
                .map(cell => cell.name)
                .join(':')
              : state.areaSelect.start.name
            : state.selected
          state.inject = add.toUpperCase()

          // erase the selection in this special case
          let inRange = cells.getCellsInRange(state.areaSelect)
          cells.bumpCells(inRange)
          if (state.selected) cells.bumpCellByName(state.selected)
          state.selected = null
          state.areaSelect = {}
        }

        state.selecting = false
        return {state, cells}
      }),

    actions.eraseSelection$
      .map(() => function eraseSelectionMod (state, cells) {
        var toErase = []
        if (state.areaSelect.start) { /* erase cells content everywhere */
          toErase = cells.getCellsInRange(state.areaSelect)
        } else if (state.selected) { /* erase this cell's content */
          toErase = [cells.getByName(state.selected)]
        }
        toErase.forEach(cell => {
          if (cell.raw !== '') cells.setByName(cell.name, '')
          else cells.bumpCell(cell)
        })
        return {state, cells}
      })
      .delay(1),

    actions.modifySelection$
      .map(([keyName, e]) => function modifySelectionMod (state, cells) {
        // if there's not a selected area, start it now
        if (!state.areaSelect.start && state.selected) {
          let startAt = cells.getByName(state.selected)
          state.areaSelect = {start: startAt, end: startAt}
        }
        let oldRange = cells.getCellsInRange(state.areaSelect)

        var newSelected
        switch (keyName) {
          case 'up':
            newSelected = cells.getNextUp(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !state.areaSelect.end.raw.trim()) {
                let next = cells.getNextUp(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'down':
            newSelected = cells.getNextDown(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !state.areaSelect.end.raw.trim()) {
                let next = cells.getNextDown(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'left':
            newSelected = cells.getNextLeft(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !state.areaSelect.end.raw.trim()) {
                let next = cells.getNextLeft(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'right':
            newSelected = cells.getNextRight(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw.trim() === !state.areaSelect.end.raw.trim()) {
                let next = cells.getNextRight(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          default: return {state, cells}
        }
        state.areaSelect.end = newSelected
        let newRange = cells.getCellsInRange(state.areaSelect)

        // now that we have updated the selected range, refresh all that may have been affected
        cells.bumpCells(oldRange)
        cells.bumpCells(newRange)

        return {state, cells}
      }),

    actions.afterPaste$
      .map(rows => function getPastedValuesMod (state, cells) {
        // determine where will the paste start
        var startAt
        if (state.areaSelect.start) {
          startAt = cells.getByRowColumn(
            Math.min(state.areaSelect.start.row, state.areaSelect.end.row),
            Math.min(state.areaSelect.start.column, state.areaSelect.end.column)
          )
        } else if (state.selected) {
          startAt = cells.getByName(state.selected)
        } else {
          return {state, cells}
        }

        var cellBeingUpdated = startAt
        var lastUpdated
        var currentRow = startAt
        var next
        for (let r = 0; r < rows.length; r++) {
          let row = rows[r]
          for (let v = 0; v < row.length; v++) {
            let value = row[v]
            cells.setByName(cellBeingUpdated.name, value)
            lastUpdated = cellBeingUpdated
            next = cells.getNextRight(cellBeingUpdated)
            if (cellBeingUpdated === next) break
            cellBeingUpdated = next
          }
          next = cells.getNextDown(currentRow)
          if (currentRow === next) break
          currentRow = next
          cellBeingUpdated = next
        }

        // the pasted cells should be selected
        state.areaSelect = {
          start: startAt,
          end: lastUpdated
        }

        return {state, cells}
      })
  )
}

export default function app ({
  DOM,
  COPYPASTE,
  INJECT,
  CELLS: cells$ = Rx.Observable.just(new Grid(6, 6)).shareReplay(1),
  STATE: state$ = Rx.Observable.just(null)
    .map(state => extend({areaSelect: {}, handleSelect: {}}, state || {}))
    .shareReplay(1),
  keydown: keydown$,
  keypress: keypress$
}) {
  let actions = intent(DOM, COPYPASTE, INJECT, keydown$, keypress$)

  let mod$ = modifications(actions)
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
      state.areaLast = false
      let o = Rx.Observable.just({state, cells})

      return o.concat(
        o
          .delay(1)
          .map(({state, cells}) => {
            // postpone setting handle
            if (!state.selecting) {
              if (state.areaSelect.start) {
                let last = cells.lastCellInRange(state.areaSelect)
                cells.setHandle(last)
                return {state, cells}
              } else if (state.selected) {
                let last = cells.getByName(state.selected)
                cells.setHandle(last)
                return {state, cells}
              }
            } else {
              cells.unsetHandle()
              return {state, cells}
            }
          })
          .filter(x => x)
      )
    })
    .share()

  let inject$ = actions.cellMouseUp$
    .withLatestFrom(
      signal$,
      DOM.select('.top.editing input, .cell.editing input').observable,
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

  let vtree$ = signal$
    .map(({state, cells}) => vrender.main(state, cells))

  return {
    DOM: vtree$,
    COPYPASTE: valuesToCopy$,
    INJECT: inject$,
    ADAPTWIDTH: DOM.select('.cell.editing input').observable
      .filter(inputs => inputs.length)
      .map(inputs => inputs[0]),
    STATE: state$,
    CELLS: cells$
  }
}
