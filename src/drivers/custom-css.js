import extend from 'xtend'

module.exports = makeCustomCSSDriver

/* this just controls the custom <style> element with the
   sheet columns and row sizes as edited by the user. */

var rules = {columns: {}, rows: {}}
var style = document.createElement('style')
document.head.appendChild(style)

function makeCustomCSSDriver (initialRules = {}) {
  rules = extend(rules, initialRules)

  return function customCSSDriver (mod$) {
    // initial apply
    style.innerHTML = render(rules)

    return mod$
      .map(mod => {
        // update rules
        let { type } = mod
        switch (type) {
          case 'rules':
            rules = extend(rules, mod.rules)
            break
          case 'resize-row':
            rules.rows[mod.index] = mod.size
            break
          case 'resize-column':
            rules.columns[mod.index] = mod.size
            break
        }

        style.innerHTML = render(rules)

        return rules /* expose updated rules */
      })
      .share() /* because maybe no one is listening to this
                  but we still have to update the CSS. */
  }
}

function render (rules) {
  var css = ''
  for (let index in rules.rows) {
    css += `.row:nth-child(${index}) .cell {
      height: ${rules.rows[index]}px !important;
    }`
    if (rules.rows[index] > 40) {
      css += `.row:nth-child(${index}) input {
        word-break: break-word !important;
      }`
    }
  }
  for (let index in rules.columns) {
    css += `.cell:nth-child(${index}) {
      width: ${rules.columns[index]}px !important;
    }`
    if (rules.columns[index] < 82) {
      css += `.cell:nth-child(${index}) input {
        word-break: normal !important;
      }`
    }
  }
  return css
}