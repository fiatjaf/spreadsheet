module.exports = makeAdaptWidthDriver

function makeAdaptWidthDriver () {
  return function (input$) {
    input$
      .delay(1)
      .subscribe(input => {
        adaptWidth(input)
        input.addEventListener('input', () => adaptWidth(input))
      })
  }
}

function adaptWidth (input) {
  if (input.offsetWidth < input.scrollWidth) {
    input.style.width = (input.scrollWidth + 2) + 'px'
  }
}
