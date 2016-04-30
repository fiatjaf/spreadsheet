import Rx from 'rx'

module.exports = makeContextMenuDriver

var div
var action$

function makeContextMenuDriver () {
  action$ = new Rx.Subject()

  div = document.createElement('div')
  div.id = 'context-menu'
  document.body.appendChild(div)

  div.addEventListener('click', function (e) {
    e.preventDefault()
    if (e.target.classList.contains('disabled')) return

    let tag = e.target.dataset.tag

    action$.onNext(tag)
  })

  document.body.addEventListener('click', function (e) {
    hide()
  })

  return function contextMenuDriver (trigger$) {
    trigger$.subscribe(({e, state}) => {
      let items = [
        {title: 'Merge cells', tag: 'MERGE', disabled:
          !state.areaSelect.end || !state.areaSelect.start ||
          (state.areaSelect.start.name === state.selected && state.areaSelect.end.name === state.selected)
        },
        {title: 'Unmerge cells', tag: 'UNMERGE', disabled:
          !state.selected || !state.mergeGraph.isMergedOver(state.selected)
        }
      ]
      show(items, e)
    })

    return action$
  }
}

function show (items, e) {
  e.preventDefault()

  div.style.left = `${e.pageX}px`
  div.style.top = `${e.pageY}px`

  div.innerHTML = `<ul>${
    items.map(i =>
      `<li><a class='${i.disabled ? 'disabled' : ''}' data-tag='${i.tag}'>${i.title}</a></li>`
    ).join('')
  }</ul>`
}

function hide () {
  div.innerHTML = ''
  div.style.left = ''
  div.style.right = ''
}
