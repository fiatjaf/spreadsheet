import Rx from 'rx'
import keycode from 'keycode'

import { cellInRange, between } from './grid'
import { handleValueGenerator } from './handle-drag'

module.exports.intent = intent
module.exports.modifications = modifications

function intent (DOM, COPYPASTE, INJECT, keydown$, keypress$) {
  let cellClick$ = DOM.select('.cell.dyn:not(.editing)').events('click')
    .filter(e => e.target === e.ownerTarget)
  let cellInput$ = DOM.select('.cell.dyn.editing input').events('input')
  let cellBlur$ = DOM.select('.cell.dyn.editing').events('blur')

  let bufferedCellClick$ = cellClick$
    .map(e => e.ownerTarget.dataset.name)
    .buffer(() => cellClick$.debounce(250))
    .share()

  let topInput$ = DOM.select('.top input').events('input')
  let topClick$ = DOM.select('.top input').events('click')
  let topBlur$ = DOM.select('.top input').events('blur')

  let cellMouseDown$ = DOM.select('.cell.dyn:not(.editing)').events('mousedown')
    .filter(e => e.target === e.ownerTarget)
  let cellMouseEnter$ = DOM.select('.cell.dyn:not(.editing)').events('mouseenter')
  let cellMouseUp$ = DOM.select('.cell.dyn:not(.editing)').events('mouseup')

  // "handle" is not a verb, but that small box that stands at the side of the cell.
  let handleMouseDown$ = DOM.select('.handle').events('mousedown')

  // at least let's attempt to handle Mac weirdnes with the "Command" key
  const isMac = navigator.platform.indexOf('Mac') !== -1
  keydown$ = keydown$.do(e => {
    if (isMac) e.ctrlKey = e.metaKey
  })

  let staticClick$ = DOM.select('.cell.static').events('click')

  let editingKeydown$ = keydown$
    .filter(e => e.target.tagName === 'INPUT' &&
                 e.target.parentNode.classList.contains('editing'))
    .map(e => [keycode(e), e])
  let keyCommand$ = keydown$
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
    staticClick$: staticClick$
      .map(e => ({
        row: e.ownerTarget.classList.contains('left'),
        column: e.ownerTarget.classList.contains('top'),
        index: parseInt(e.ownerTarget.dataset.index, 0) - 2
      })),
    cellMouseDown$: cellMouseDown$.map(e => e.ownerTarget.dataset.name),
    cellMouseEnter$: cellMouseEnter$.map(e => e.ownerTarget.dataset.name),
    cellMouseUp$: cellMouseUp$.map(e => e.ownerTarget.dataset.name),
    handleMouseDown$: handleMouseDown$.map(e => e.target.parentNode.dataset.name),
    keyCommandFromInput$: editingKeydown$,
    keyCommandWithShift$: keyCommand$
      .filter(([_, e]) => e.shiftKey),
    keyCommandWithoutShift$: keyCommand$
      .filter(([_, e]) => !e.shiftKey),
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
          state.areaSelecting = false
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

    actions.keyCommandWithoutShift$
      .map(([keyName, e]) => function keyCommandWithoutShiftMod (state, cells) {
        // first try some keybindings that may be triggered at any time
        switch (keyName) {
          case 'z':
            if (e.ctrlKey) {
              cells.undo()
            }
            e.preventDefault() // prevent default so keypress will not be triggered
            return {state, cells}
          case 'y':
            if (e.ctrlKey) {
              cells.redo()
            }
            e.preventDefault() // prevent default so keypress will not be triggered
            return {state, cells}
        }

        // moving selected cell (without shift, so move the 'selected', not the entire selection)
        if (state.selected) {
          let old = cells.getByName(state.selected)
          var newSelected
          switch (keyName) {
            case 'up':
              newSelected = cells.getNextUp(old)
              if (e.ctrlKey) {
                while (!newSelected.raw === !old.raw) {
                  let next = cells.getNextUp(newSelected)
                  if (newSelected === next) break
                  newSelected = next
                }
              }
              break
            case 'down':
              newSelected = cells.getNextDown(old)
              if (e.ctrlKey) {
                while (!newSelected.raw === !old.raw) {
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
                while (!newSelected.raw === !old.raw) {
                  let next = cells.getNextLeft(newSelected)
                  if (newSelected === next) break
                  newSelected = next
                }
              }
              break
            case 'right':
              newSelected = cells.getNextRight(old)
              if (e.ctrlKey) {
                while (!newSelected.raw === !old.raw) {
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
            state.areaSelecting = false
            state.areaSelect = {}
          }

          e.preventDefault() // prevent default so keypress will not be triggered
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
          state.areaSelecting = false
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
          state.currentInput = character
          cells.bumpCell(cell)

          // unselect it
          state.selected = null

          // unmark the old selected range
          if (state.areaSelect.start) {
            let inRange = cells.getCellsInRange(state.areaSelect)
            cells.bumpCells(inRange)
            state.areaSelecting = false
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
          state.areaSelecting = false
          state.areaSelect = {}
        }

        return {state, cells}
      }),

    actions.input$
      .merge(actions.topInput$)
      .merge(actions.injected$)
      .map(val => function saveCurrentInputMod (state, cells) {
        state.currentInput = val
        // cells.getByName(state.editing).raw = val
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
          state.areaSelecting = null
          state.areaSelect = {}
          cells.bumpCells(inRange)
        }

        if (state.editing) {
          if (state.valueBeforeEdit !== state.currentInput) {
            cells.setByName(state.editing, state.currentInput)
          }
          cells.bumpCellByName(state.editing)
          state.editing = null
          state.editingTop = false
        }

        state.currentInput = null
        return {state, cells}
      }),

    actions.keyCommandFromInput$
      .map(([keyName]) => function changeEditingStateMod (state, cells) {
        let cell = cells.getByName(state.editing)
        let changed = state.valueBeforeEdit !== state.currentInput
        var next

        switch (keyName) {
          case 'enter':
            if (changed) cells.set(cell, state.currentInput)
            next = cells.getNextDown(cell)
            break
          case 'tab':
            if (changed) cells.set(cell, state.currentInput)
            next = cells.getNextRight(cell)
            break
          case 'up':
            if (changed) cells.set(cell, state.currentInput)
            next = cells.getNextUp(cell)
            break
          case 'down':
            if (changed) cells.set(cell, state.currentInput)
            next = cells.getNextDown(cell)
            break
          case 'esc':
            if (changed) cells.set(cell, state.valueBeforeEdit)
            next = cells.getByName(state.editing)
            break
          default: return {state, cells}
        }

        state.editing = null
        state.currentInput = null

        cells.bumpCell(cell)
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
        state.areaSelecting = true
        state.areaSelect = {
          start: cell,
          end: cell
        }
        cells.bumpCell(cell)

        return {state, cells}
      }),

    actions.staticClick$
      .map(({row, column, index}) => function selectLineMod (state, cells) {
        state.editing = false
        state.areaSelecting = false

        if (index === -1) { // select all
          state.areaSelect.start = cells.getByRowColumn(0, 0)
          state.areaSelect.end = cells.getByRowColumn(cells.numRows() - 1, cells.numColumns() - 1)
        } else if (row) { // select row
          state.areaSelect.start = cells.getByRowColumn(index, 0)
          state.areaSelect.end = cells.getByRowColumn(index, cells.numColumns() - 1)
        } else if (column) { // select column
          state.areaSelect.start = cells.getByRowColumn(0, index)
          state.areaSelect.end = cells.getByRowColumn(cells.numRows() - 1, index)
        }
        state.selected = state.areaSelect.start.name

        cells.bumpAllCells()
        return {state, cells}
      }),

    actions.handleMouseDown$
      .map(cellName => function startDraggingHandleMod (state, cells) {
        let base = state.areaSelect.start ? {
          // in .handleDrag, .start is assured to be the top and
          // leftmost cell and .end the bottom and rightmost
          start: cells.firstCellInRange(state.areaSelect),
          end: cells.lastCellInRange(state.areaSelect)
        } : {start: cells.getByName(state.selected), end: cells.getByName(state.selected)}

        state.handleSelecting = true
        state.handleDrag = {
          base: base,
          type: 'column', // 'row' or 'column'
          from: 'end', // 'start' or 'end' -- from where we will count the length
          length: 0 // can be negative
        }
        return {state, cells}
      }),

    actions.cellMouseEnter$
      .map((cellName) => function alterSelectionMod (state, cells) {
        if (!state.areaSelecting && !state.handleSelecting) return {state, cells}

        // if the mouse key was released out of the browser window
        // we should detect it now and cancel the "selecting" state
        let pressed = document.querySelectorAll('*:active')
        let lastPressed = pressed[pressed.length - 1]
        if (!pressed.length ||
            ((state.handleSelecting &&
              lastPressed.className !== 'handle') ||
             (state.areaSelecting &&
              lastPressed.dataset.name !== state.areaSelect.start.name))) {
          if (state.handleSelecting) {
            // "handle" area being hovered
            state.handleDrag = {}
            state.handleSelecting = false
          } else {
            // normal area select
            state.areaSelect = {}
            state.areaSelecting = false
          }

          cells.bumpAllCells()
          return {state, cells}
        }

        let cell = cells.getByName(cellName)
        if (state.handleSelecting) {
          let {base} = state.handleDrag

          // handle select
          if (cellInRange(cell, base)) {
            // hovering the middle of the areaSelect -- nothing should happen
            state.handleDrag.type = 'column'
            state.handleDrag.from = 'end'
            state.handleDrag.length = 0
          } else if (between(cell.column, base.start.column, base.end.column)) {
            // dragging to the top or bottom
            state.handleDrag.type = 'row'
            if (cell.row < base.start.row) { // top
              state.handleDrag.from = 'start'
              state.handleDrag.length = cell.row - base.start.row
            } else { // bottom
              state.handleDrag.from = 'end'
              state.handleDrag.length = cell.row - base.end.row
            }
          } else if (between(cell.row, base.start.row, base.end.row)) {
            // to the left or right
            state.handleDrag.type = 'column'
            if (cell.column < base.start.column) { // left
              state.handleDrag.from = 'start'
              state.handleDrag.length = cell.column - base.start.column
            } else { // right
              state.handleDrag.from = 'end'
              state.handleDrag.length = cell.column - base.end.column
            }
          } else {
            // some diagonal
          }
        } else {
          // normal area select
          state.areaSelect.end = cell
        }

        cells.bumpAllCells()
        return {state, cells}
      }),

    actions.cellMouseUp$
      .map((cellName) => function stopSelectingMod (state, cells) {
        if (state.editing && state.currentInput[0] === '=') {
          // the case where we are editing some cell
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

        if (state.handleSelecting && state.handleDrag.length) {
          // perform the handle drag operation
          var txn = {cells: [], values: []}
          let generate = handleValueGenerator(cells, state.handleDrag)
          let { base, length, from, type } = state.handleDrag
          let it = length / Math.abs(length) // either +1 or -1
          if (type === 'row') {
            for (let c = base.start.column; c <= base.end.column; c++) {
              let distance = 1
              for (let r = base[from].row + it; r !== base[from].row + length + it; r = r + it) {
                let cell = cells.getByRowColumn(r, c)
                txn.cells.push(cell)
                txn.values.push(generate(c, distance))
                distance++
              }
            }
          } else {
            for (let r = base.start.row; r <= base.end.row; r++) {
              let distance = 1
              for (let c = base[from].column + it; c !== base[from].column + length + it; c = c + it) {
                let cell = cells.getByRowColumn(r, c)
                txn.cells.push(cell)
                txn.values.push(generate(r, distance))
                distance++
              }
            }
          }
          cells.setMany(txn.cells, txn.values)

          state.handleSelecting = false
          state.handleDrag = {}
        } else {
          state.areaSelecting = false
        }

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

        var txn = {cells: [], values: []}
        toErase.forEach(cell => {
          txn.cells.push(cell)
          txn.values.push('')
        })
        cells.setMany(txn.cells, txn.values)

        return {state, cells}
      })
      .delay(1),

    actions.keyCommandWithShift$
      .map(([keyName, e]) => function keyCommandWithShiftMod (state, cells) {
        // first try some general keybindings
        var matched = false
        switch (keyName) {
          case 'z':
            if (e.ctrlKey) {
              cells.redo()
              matched = true
            }
            break
        }

        if (matched) {
          // prevent default so keypress will not be triggered
          e.preventDefault()

          return {state, cells}
        }
        // if nothing matches, proceed to general selection modifications

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
              while (!newSelected.raw === !state.areaSelect.end.raw) {
                let next = cells.getNextUp(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'down':
            newSelected = cells.getNextDown(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw === !state.areaSelect.end.raw) {
                let next = cells.getNextDown(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'left':
            newSelected = cells.getNextLeft(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw === !state.areaSelect.end.raw) {
                let next = cells.getNextLeft(newSelected)
                if (newSelected === next) break
                newSelected = next
              }
            }
            break
          case 'right':
            newSelected = cells.getNextRight(state.areaSelect.end)
            if (e.ctrlKey) {
              while (!newSelected.raw === !state.areaSelect.end.raw) {
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

        // prevent default so keypress will not be triggered
        e.preventDefault()

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

        var txn = {cells: [], values: []}
        var cellBeingUpdated = startAt
        var lastUpdated
        var currentRow = startAt
        var next
        for (let r = 0; r < rows.length; r++) {
          let row = rows[r]
          for (let v = 0; v < row.length; v++) {
            let value = row[v]
            txn.cells.push(cellBeingUpdated)
            txn.values.push(value)
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
        cells.setMany(txn.cells, txn.values)

        // the pasted cells should be selected
        state.areaSelect = {
          start: startAt,
          end: lastUpdated
        }

        return {state, cells}
      })
  )
}
