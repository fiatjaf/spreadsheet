export function deselect () {
  let selection = ('getSelection' in window)
    ? window.getSelection()
    : ('selection' in document)
      ? document.selection
      : null
  if ('removeAllRanges' in selection) selection.removeAllRanges()
  else if ('empty' in selection) selection.empty()
}

export function renderParsedFormula (expr) {
  return '=' + print(expr)
}

const operators = {
  MULTIPLY: '*',
  SUM: '+',
  DIVIDE: '/',
  SUBTRACT: '-'
}

function print (e) {
  if (e.type !== 'function') {
    switch (e.type) {
      case 'range':
        return (e.start.name + ':' + e.end.name).toUpperCase()
      case 'cell':
        return e.cell.name.toUpperCase()
      case 'number':
        return e.value
      case 'string':
        var value = e.value
        var sep = '"'
        if (value.search(sep)) sep = "'"
        if (value.search(sep)) value = value.replace(RegExp(sep, 'g'), '\\' + sep)
        return '"' + value + '"'
      case 'empty':
        return null
    }
  }

  if (e.operator) {
    return print(e.arguments[0]) + operators[e.fn] + print(e.arguments[1])
  }

  return `${e.fn}(${
    e.arguments
      .map(arg => print(arg))
      .filter(p => p)
      .join(', ')
  })`
}
