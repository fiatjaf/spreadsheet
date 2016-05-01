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
          rules.rows[mod.index] = mod.size
          break
        case 'resize-column':
          rules.columns[mod.index] = mod.size
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

      return rules /* expose updated rules */
    })

    mod$.connect()

    return mod$
  }
}

function render (rules) {
  var css = ''
  for (let index in rules.rows) {
    css += `.row:nth-child(${index}) .cell {
      height: ${rules.rows[index]}px !important;
    }\n`
    if (rules.rows[index] > 40) {
      css += `.row:nth-child(${index}) input {
        word-break: break-word !important;
      }\n`
    }
  }
  for (let index in rules.columns) {
    css += `.cell:nth-child(${index}) {
      width: ${rules.columns[index]}px !important;
    }\n`
    if (rules.columns[index] < 82) {
      css += `.cell:nth-child(${index}) input {
        word-break: normal !important;
      }\n`
    }
  }
  for (let cellName in rules.cells) {
    css += `.cell[data-name="${cellName}"] {`
    for (let ruleName in rules.cells[cellName]) {
      css += `${ruleName}: ${rules.cells[cellName][ruleName]};`
    }
    css += `}\n`
  }
  return css
}
