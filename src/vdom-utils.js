import {deselect} from './helpers'

export function ControlledInputHook (injectedText) {
  this.injectedText = injectedText
}
ControlledInputHook.prototype.hook = function hook (element) {
  element.value = this.injectedText
}

export function FocusHook () {}
FocusHook.prototype.hook = function hook (element) {
  deselect()
  setTimeout(() => element.focus(), 1)
}

export function InputWidget (value, injected) {
  this.value = value
  this.injected = injected
}
InputWidget.prototype.type = 'Widget'
InputWidget.prototype.init = function () {
  let input = document.createElement('input')
  input.value = this.value
  setTimeout(() => input.focus(), 0)
  return input
}
InputWidget.prototype.update = function (prev, input) {
  if (this.injected) {
    let isModernBrowser = ('selectionStart' in input &&
                           'selectionEnd' in input)
    var strPos
    if (isModernBrowser) {
      strPos = input.selectionStart
    } else {
      input.focus()
      let range = document.selection.createRange()
      range.moveStart('character', -input.value.length)
      strPos = range.text.length
    }

    let before = (input.value).substring(0, strPos)
    let after = (input.value).substring(strPos, input.value.length)
    input.value = before + this.injected + after

    // emit an event so the app can listen to and update itself
    let event = document.createEvent('Event')
    event.initEvent('raw-update', true, true)
    input.dispatchEvent(event)

    // set the cursor to the right position
    if (isModernBrowser) {
      input.selectionStart = strPos + this.injected.length
      input.selectionEnd = strPos + this.injected.length
    } else {
      let range = document.selection.createRange()
      range.moveStart('character', strPos)
      range.moveEnd('character', 0)
      range.select()
    }
    input.focus()
  }
}
