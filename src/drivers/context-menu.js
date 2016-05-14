import Rx from 'rx'
import {h} from '@cycle/dom'
import cx from 'class-set'
import toHTML from 'vdom-to-html'

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
    let value = e.target.dataset.value

    action$.onNext({tag, value})
  })

  document.body.addEventListener('click', function (e) {
    hide()
  })

  return function contextMenuDriver (trigger$) {
    trigger$.subscribe(({e, state, cells, tag}) => {
      var items

      if (tag === 'CELL') {
        items = [
          {multiple: true, tag: 'BACKGROUND', options: backgroundColours.map(o => ({
            value: o,
            style: {backgroundColor: o}
          }))},
          {multiple: true, tag: 'COLOUR', options: letterColours.map(o => ({
            value: o,
            style: {color: o}
          }))},
          {title: 'Merge cells', tag: 'MERGE', disabled:
            !state.areaSelect.end || !state.areaSelect.start ||
            (state.areaSelect.start.name === state.selected && state.areaSelect.end.name === state.selected)
          },
          {title: 'Unmerge cells', tag: 'UNMERGE', disabled:
            !state.selected ||
            !state.mergeGraph.isMergedOver(cells.idFromName(state.selected))
          }
        ]
      } else if (tag === 'HEADER') {
        let headerKind = e.ownerTarget.classList.contains('left') ? 'ROW' : 'COLUMN'
        items = [
          {title: `Drop ${headerKind.toLowerCase()}`, tag: `DROP-${headerKind}`, value: parseInt(e.ownerTarget.dataset.index) - 2},
          {title: `Add ${headerKind.toLowerCase()} before`, tag: `ADD-${headerKind}-BEFORE`, value: parseInt(e.ownerTarget.dataset.index) - 2},
          {title: `Add ${headerKind.toLowerCase()} after`, tag: `ADD-${headerKind}-AFTER`, value: parseInt(e.ownerTarget.dataset.index) - 2}
        ]
      }

      show(items, e)
    })

    return action$
  }
}

function show (items, e) {
  e.preventDefault()

  div.style.left = `${e.pageX}px`
  div.style.top = `${e.pageY}px`

  div.innerHTML = toHTML(h('ul', items.map(i =>
    h('li', [
      i.multiple
      ? i.options.length <= 7
        ? i.options.map(o =>
          h('a.box', {
            attributes: {'data-tag': i.tag, 'data-value': o.value},
            style: o.style
          }, 'F')
        )
        : [h('select', [i.options.map(o => h('option', {value: o.value}, o.value))])]
      : h('a', {
        className: cx({disabled: i.disabled}),
        attributes: {'data-tag': i.tag, 'data-value': i.value}
      }, i.title)
    ])
  )))
}

function hide () {
  div.innerHTML = ''
  div.style.left = ''
  div.style.right = ''
}

const backgroundColours = [
  '#FFABAB',
  '#FFDAAB',
  '#DDFFAB',
  '#ABE4FF',
  '#D9ABFF',
  '#FFFFFF',
  '#000000'
]

const letterColours = [
  '#00CBE7',
  '#00DA3C',
  '#F4F328',
  '#FD8603',
  '#DF151A',
  '#FFFFFF',
  '#000000'
]
