import window from 'global/window'

export function deselect () {
  let selection = ('getSelection' in window)
    ? window.getSelection()
    : ('selection' in document)
      ? document.selection
      : null
  if ('removeAllRanges' in selection) selection.removeAllRanges()
  else if ('empty' in selection) selection.empty()
}
