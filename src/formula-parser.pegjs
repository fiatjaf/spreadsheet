formula
  = "=" expr:expr { return expr }
  
expr
  = _ e1:operative _ op:operator _ e2:expr _ {
    return {
      type: 'function',
      fn: op,
      arguments: [e1, e2]
    }
  }
  / _ o:operative _ { return o }
  
operative
  = r:range { return {type: 'range', start: r.start, end: r.end} }
  / c:cell { return {type: 'cell', name: c} }
  / n:number { return {type: 'number', value: n} }
  / s:string { return {type: 'string', value: s} }
  / fn
  / "(" _ o:operative _ ")" { return o }

operator
  = '+' { return 'SUM' }
  / '-' { return 'SUBTRACT' }
  / '*' { return 'MULTIPLY' }
  / '/' { return 'DIVIDE' }

fn
  = n:[a-z]i+ _ "(" args:argument* _ arg:expr? _ ")" {
    return {
      type: 'function',
      fn: n.join('').toUpperCase(),
      arguments: args.concat(arg).filter(x => x)
    }
  }

argument
  = _ o:expr _ "," { return o }
  / _ o:expr _ ";" { return o }
  
string
  = "'" chars:chars* "'" { return chars.join('') }
  / '"' chars:chars* '"' { return chars.join('') }
  
chars
  = [a-zA-Z0-9,.-;()!@#$%*_<>^\]}{\[?!~&+-|]

range
  = c1:cell ":" c2:cell { return {start: c1, end: c2} }

cell
  = l:[a-z]i+ n:number { return (l.join('') + n).toLowerCase() }
  
number
  = digits:[0-9]+ { return parseFloat(digits.join('')) }

_
  = " " * { return null }
