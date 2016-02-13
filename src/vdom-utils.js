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
