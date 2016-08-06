Built with [Cycle.js](http://cycle.js.org/), meaning that it can be embedded into other components as it is, providing you pass it the drivers it expects.

It is being used on https://share.sheets.ninja/ and [Sidesheet](https://chrome.google.com/webstore/detail/sidesheet/iheklhbgdljkmijlfajakikbgemncmfd).

The API is expected to change.

---

## Try it

To run it as a standalone spreadsheet:

```
git clone git@github.com:fiatjaf/spreadsheet.git
cd spreadsheet/
npm install
npm run parser
npm run browserify
npm run server
```

Then open http://0.0.0.0:5000/
