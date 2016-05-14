import Rx from 'rx'
import keycode from 'keycode'

import { cellInRange, between } from './grid'
import { handleValueGenerator } from './handle-drag'

module.exports.intent = intent
module.exports.modifications = modifications

function intent (DOM, COPYPASTE, INJECT, CONTEXTMENU, keydown$, keypress$) {
  let cellClick$ = DOM.select('.cell .text').events('click')
    .filter(e => e.which !== 3 /* right-clicks are ignored */)
  let cellInput$ = DOM.select('.cell.dyn.editing input').events('input')
  let cellBlur$ = DOM.select('.cell.dyn.editing').events('blur')

  let bufferedCellClick$ = cellClick$
    .map(e => e.ownerTarget.parentNode.dataset.name)
    .buffer(() => cellClick$.debounce(250))
    .share()

  let topInput$ = DOM.select('.top input').events('input')
  let topClick$ = DOM.select('.top input').events('click')
  let topBlur$ = DOM.select('.top input').events('blur')

  let cellMouseDown$ = DOM.select('.cell .text').events('mousedown')
    .filter(e => e.which !== 3 /* right-clicks are ignored */)
  let cellMouseEnter$ = DOM.select('.cell .text').events('mouseenter')
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
    cellMouseDown$: cellMouseDown$.map(e => e.ownerTarget.parentNode.dataset.name),
    cellMouseEnter$: cellMouseEnter$.map(e => e.ownerTarget.parentNode.dataset.name),
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
      .map(input => typeof input === 'string' ? input.split('\n').map(line => line.split('\t')) : input),
    mergeCells$: CONTEXTMENU.filter(a => a.tag === 'MERGE'),
    unmergeCells$: CONTEXTMENU.filter(a => a.tag === 'UNMERGE'),
    dropLine$: CONTEXTMENU.filter(a => a.tag.substr(0, 5) === 'DROP-'),
    insertLine$: CONTEXTMENU.filter(a => a.tag.substr(0, 4) === 'ADD-')
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
          cells.bumpCellsInRange(state.areaSelect)
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
            cells.bumpCellsInRange(state.areaSelect)
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
          cells.bumpCellsInRange(state.areaSelect)
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
            cells.bumpCellsInRange(state.areaSelect)
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
          cells.bumpCellsInRange(state.areaSelect)
          state.areaSelecting = false
          state.areaSelect = {}
        }

        return {state, cells}
      }),

    actions.input$
      .merge(actions.topInput$)
      .merge(actions.injected$)
      .map(val => function saveCurrentInputMod (state, cells) {
        if (typeof val === 'string') state.currentInput = val
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
          cells.bumpCellsInRange(state.areaSelect)
          state.areaSelecting = null
          state.areaSelect = {}
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
        cells.bumpCellsInRange(state.areaSelect)

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
        if (!pressed.length ||
            ((state.handleSelecting &&
              pressed[pressed.length - 1].className !== 'handle') ||
             (state.areaSelecting &&
              pressed[pressed.length - 2].dataset.name !== state.areaSelect.start.name))
            ) {
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
          cells.bumpAllCells()
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
          cells.bumpCells(cells.getCellsInRange(state.areaSelect)) // bump previous selection
          state.areaSelect.end = cell
          cells.bumpCells(cells.getCellsInRange(state.areaSelect)) // bump current selection
        }

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
          cells.bumpCellsInRange(state.areaSelect)
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
        // `rows` is an array of arrays of values to paste.

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

        // do the paste in a Grid transaction
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
      }),

    actions.mergeCells$
      .map(() => function mergeCellsMod (state, cells) {
        if (state.areaSelect.start && state.areaSelect.start !== state.areaSelect.end) {
          let inRange = cells.getCellsInRange(state.areaSelect)
          let first = inRange.shift()

          // do not execute this operation if some cell in the range is already merged.
          for (let i = 0; i < inRange.length; i++) {
            let cell = inRange[i]
            if (state.mergeGraph.isMergedOver(cell.id)) {
              return {state, cells}
            }
          }

          state.mergeGraph.merge(first, inRange)

          cells.bumpCells(inRange)
          cells.bumpCell(first)
        }

        return {state, cells}
      }),

    actions.unmergeCells$
      .map(() => function unmergeCellsMod (state, cells) {
        if (state.selected) {
          let modified = state.mergeGraph.unmerge(cells.getByName(state.selected))
          cells.bumpCells(modified)
        }
        return {state, cells}
      }),

    actions.dropLine$
      .map(({tag, value}) => function dropLineMod (state, cells) {
        let index = parseInt(value)
        let kind = tag.split('-')[1]

        // unselect everything (so we don't end with an unexisting cell selected)
        cells.bumpCellsInRange()
        if (state.selected) cells.bumpCellByName(state.selected)
        state.areaSelect = {}
        state.selected = null

        if (kind === 'ROW') {
          let lastRow = cells.byRowColumn[cells.byRowColumn.length - 1]
          for (let d = 0; d < lastRow.length; d++) { // remove lastRow cells from indexes
            delete cells.byName[lastRow[d].name]
            delete cells.byId[lastRow[d].id]
          }
          let droppedRow = cells.byRowColumn.splice(index, 1)[0] // drop row at index

          // automatically unmerge anything in the path
          for (let d = 0; d < droppedRow.length; d++) {
            let dropped = droppedRow[d]
            let mergedIn = state.mergeGraph.mergedIn(dropped.id)
            let toBump = state.mergeGraph.unmerge(mergedIn || dropped)
            cells.bumpCells(toBump)
            // TODO instead of unmerging, just remove the edge corresponding to this cell
          }

          for (let r = index; r < cells.byRowColumn.length; r++) {
            // change the names of all cells in all rows after the dropped index, including it
            let row = cells.byRowColumn[r]
            for (let c = 0; c < row.length; c++) {
              let cell = row[c]
              cell.row = r
              cell.name = cells.makeCellName(cell.row, cell.column)
              cells.byName[cell.name] = cell
            }
          }
        } else if (kind === 'COLUMN') {
          // for all rows, do
          for (let r = 0; r < cells.byRowColumn.length; r++) {
            let row = cells.byRowColumn[r]

            delete cells.byName[row[row.length - 1].name] // remove last cell from byName
            delete cells.byId[row[row.length - 1].id] // remove last cell from byId
            let dropped = row.splice(index, 1)[0] // remove cell at index from row

            // automatically unmerge anything in the path
            let mergedIn = state.mergeGraph.mergedIn(dropped.id)
            let toBump = state.mergeGraph.unmerge(mergedIn || dropped)
            cells.bumpCells(toBump)
            // TODO instead of unmerging, just remove the edge corresponding to this cell

            for (let c = index; c < row.length; c++) {
              let cell = row[c]
              // change the names of all cells after index, including it
              cell.column = c
              cell.name = cells.makeCellName(cell.row, cell.column)
              cells.byName[cell.name] = cell
              cells.bumpCell(cell)
            }
          }
        }

        return {state, cells}
      }),

    actions.insertLine$
      .map(({tag, value}) => function insertLineMod (state, cells) {
        let [kind, pos] = tag.split('-').slice(1)
        let index = parseInt(value)
        index = index + (pos === 'BEFORE' ? 0 : 1)
        var willMerge = {} // {[row/column index to merge]: target of the merge}

        if (kind === 'ROW') {
          // check for merges in the row
          for (let c = 0; c < cells.byRowColumn[index].length; c++) {
            let cell = cells.byRowColumn[index][c]
            let mergedIn = state.mergeGraph.mergedIn(cell.id)
            if (mergedIn && mergedIn.row !== index) willMerge[c] = mergedIn
          }

          // insert row
          var newRow = []
          for (let n = 0; n < cells.byRowColumn[0].length; n++) {
            let newCell = cells.makeCell(index, n)
            newRow[n] = newCell
            cells.byName[newCell.name] = newCell
            cells.byId[newCell.id] = newCell

            // perform the merge
            if (willMerge[n]) {
              state.mergeGraph.merge(willMerge[n], [newCell])
              cells.bumpCell(willMerge[n])
            }
          }
          cells.byRowColumn.splice(index, 0, newRow)

          for (let r = index + 1; r < cells.byRowColumn.length; r++) {
            // change the names of all cells in all rows after the inserted index
            let row = cells.byRowColumn[r]
            for (let c = 0; c < row.length; c++) {
              let cell = row[c]
              cell.row = r
              cell.name = cells.makeCellName(cell.row, cell.column)
              cells.byName[cell.name] = cell
              cells.bumpCell(cell)
            }
          }
        } else if (kind === 'COLUMN') {
          for (let r = 0; r < cells.byRowColumn.length; r++) {
            let row = cells.byRowColumn[r]

            // check for merges in the column
            for (let r = 0; r < cells.byRowColumn.length; r++) {
              let cell = cells.byRowColumn[r][index]
              let mergedIn = state.mergeGraph.mergedIn(cell.id)
              if (mergedIn && mergedIn.column !== index) willMerge[r] = mergedIn
            }

            // insert cell
            let newCell = cells.makeCell(r, index)
            cells.byName[newCell.name] = newCell
            cells.byId[newCell.id] = newCell
            row.splice(index, 0, newCell)

            // perform the merge
            if (willMerge[r]) {
              state.mergeGraph.merge(willMerge[r], [newCell])
              cells.bumpCell(willMerge[r])
            }

            for (let c = index + 1; c < row.length; c++) {
              // change the names of all cells after the inserted index
              let cell = row[c]
              cell.column = c
              cell.name = cells.makeCellName(cell.row, cell.column)
              cells.byName[cell.name] = cell
              cells.bumpCell(cell)
            }
          }
        }

        return {state, cells}
      })
  )
}
