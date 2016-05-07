formula
  = "=" expr:expr? { return expr || null }
  
expr
  = _ e1:operativeOrNothing? _ op:operator _ e2:expr? _ {
    return {
      type: 'function',
      fn: op,
      operator: true,
      arguments: [e1, e2]
    }
  }
  / operativeOrNothing

operativeOrNothing
  = _ o:operative _ { return o }
  / empty

empty
  = _ {
    var loc = location()
    return {
      type: 'empty',
      pos: [loc.start.offset, loc.end.offset]
    }
  }
  
operative
  = r:range {
    var loc = location()
    return {
      type: 'range',
      start: r.start,
      end: r.end,
      pos: [loc.start.offset, loc.end.offset]
    }
  }
  / c:cell {
    var loc = location()
    return {type: 'cell', name: c, pos: [loc.start.offset, loc.end.offset]}
  }
  / n:number {
    var loc = location()
    return {type: 'number', value: n, pos: [loc.start.offset, loc.end.offset]}
  }
  / s:string {
    var loc = location()
    return {type: 'string', value: s, pos: [loc.start.offset, loc.end.offset]}
  }
  / fn:fn {
    var loc = location()
    fn.pos = [loc.start.offset, loc.end.offset]
    return fn
  }
  / "(" o:operativeOrNothing ")" { return o }

operator
  = '+' { return 'SUM' }
  / '-' { return 'SUBTRACT' }
  / '*' { return 'MULTIPLY' }
  / '/' { return 'DIVIDE' }

fn
  = n:[a-z]i+ _ "(" args:(argument [;,])* arg:argument _ ")"? {
    return {
      type: 'function',
      fn: n.join('').toUpperCase(),
      arguments: args
        .map(function (x) { return x[0] })
        .concat(arg)
        .filter(function (x) { return x })
    }
  }

argument
  = _ o:expr _  { return o }
  / _ {
    var loc = location()
    return {type: 'empty', pos: [loc.start.offset, loc.end.offset]}
  }
  
string
  = "'" chars:chars* "'" { return chars.join('') }
  / '"' chars:chars* '"' { return chars.join('') }
  
chars
  = [a-zA-Z\u0080-\u00FF0-9,.-;()!@#$%*_<>^\]}{\[?!~&+-|]

range
  = c1:cell ":" c2:cell { return {start: c1, end: c2} }

cell
  = l:[a-z]i+ n:number { return (l.join('') + n).toLowerCase() }
  
number
  = d1:[0-9]* '.' d2:[0-9]* {
    return parseFloat((d1.join('') || 0) + '.' + d2.join(''))
  }
  / digits:[0-9]+ { return parseFloat(digits.join('')) }

_
  = " " * { return null }
