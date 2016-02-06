import Thunk from 'vdom-thunk/immutable-thunk'

export default function (eq) {
  return function thunk (key, fn) {
    let args = copyOver(arguments, 2)
    return new Thunk(fn, args, key, eq)
  }
}

function copyOver (list, offset) {
  var newList = []
  for (var i = list.length - 1; i >= offset; i--) {
    newList[i - offset] = list[i]
  }
  return newList
}
