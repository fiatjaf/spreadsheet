import extend from 'deep-extend'

module.exports = makeCustomCSSDriver

/* this just controls the custom <style> element with the
   sheet columns and row sizes as edited by the user. */

var rules = {columns: {}, rows: {}, cells: {}}
var style = document.createElement('style')
document.head.appendChild(style)

function makeCustomCSSDriver (initialRules = {}) {
  rules = extend(rules, initialRules)

  // initial apply
  style.innerHTML = render(rules)

  return function customCSSDriver (mod$) {
    mod$ = mod$.publish()

    mod$.subscribe(mod => {
      // update rules
      let { type } = mod
      switch (type) {
        case 'resize-row':
          rules.rows[mod.id] = mod.size
          break
        case 'resize-column':
          rules.columns[mod.id] = mod.size
          break
        case 'color':
        case 'background-color':
          rules.cells = extend(rules.cells || {}, mod.cells)
          break
        case 'rules':
          rules = extend(rules, mod.rules)
          break
      }

      style.innerHTML = render(rules)
    })

    mod$.connect()

    return mod$
      .map(() => rules /* expose current rules */)
  }
}

function render (rules) {
  var css = ''
  for (let id in rules.rows) {
    css += `.row.row-id-${id} .cell {
      height: ${rules.rows[id]}px !important;
    }\n`
    if (rules.rows[id] > 40) {
      css += `.row.row-id-${id} input {
        word-break: break-word !important;
      }\n`
    }
  }
  for (let id in rules.columns) {
    css += `.cell.col-id-${id} {
      width: ${rules.columns[id]}px !important;
    }\n`
    if (rules.columns[id] < 82) {
      css += `.cell.col-id-${id} input {
        word-break: normal !important;
      }\n`
    }
  }
  for (let cellId in rules.cells) {
    css += `.cell.cell-id-${cellId} {`
    for (let ruleName in rules.cells[cellId]) {
      css += `${ruleName}: ${rules.cells[cellId][ruleName]};`
    }
    css += `}\n`
  }
  return css
}
