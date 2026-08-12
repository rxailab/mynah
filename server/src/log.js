const stamp = () => new Date().toISOString().slice(11, 23)

const write = (level, scope, msg, extra) => {
  const line = `${stamp()} ${level} [${scope}] ${msg}`
  if (extra === undefined) console.log(line)
  else console.log(line, extra)
}

export const log = {
  info: (scope, msg, extra) => write('INFO ', scope, msg, extra),
  warn: (scope, msg, extra) => write('WARN ', scope, msg, extra),
  error: (scope, msg, extra) => write('ERROR', scope, msg, extra),
}
