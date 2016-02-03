import update, {updateKey} from 'immupdate'

class State {
  constructor (values) {
    this._values = values
  }

  get (key) {
    return key ? this._values[key] : this._values
  }

  set (key, value) {
    this._values = updateKey(this._values, key, value)
    return this
  }

  update (values) {
    this._values = update(this._values, values)
    return this
  }
}

module.exports = State
