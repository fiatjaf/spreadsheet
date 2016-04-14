module.exports = customCSSDriver

/* this just controls the custom <style> element with the
   sheet columns and row sizes as edited by the user. */

var rules = {columns: {}, rows: {}}
var style = document.createElement('style')
document.head.appendChild(style)

function customCSSDriver (mod$) {
  mod$.subscribe(mod => {
    let { type } = mod
    switch (type) {
      case 'resize-row':
        rules.rows[mod.index] = mod.size
        break
      case 'resize-column':
        rules.columns[mod.index] = mod.size
        break
    }

    style.innerHTML = render(rules)
  })
}

function render (rules) {
  var css = ''
  for (let index in rules.rows) {
    css += `.row:nth-child(${index}) .cell { height: ${rules.rows[index]}px !important; }\n`
  }
  for (let index in rules.columns) {
    css += `.cell:nth-child(${index}) { width: ${rules.columns[index]}px !important; }\n`
  }
  return css
}
