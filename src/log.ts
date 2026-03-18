const supportsColor = process.stdout.isTTY ?? false

function wrap(code: string, text: string): string {
  return supportsColor ? `\x1b[${code}m${text}\x1b[0m` : text
}

export const dim = (t: string) => wrap("2", t)
export const bold = (t: string) => wrap("1", t)
export const red = (t: string) => wrap("31", t)
export const green = (t: string) => wrap("32", t)
export const yellow = (t: string) => wrap("33", t)
export const cyan = (t: string) => wrap("36", t)

export function info(msg: string) {
  console.log(dim("[wolder]"), msg)
}

export function success(msg: string) {
  console.log(green("[wolder]"), msg)
}

export function warn(msg: string) {
  console.log(yellow("[wolder]"), msg)
}

export function error(msg: string) {
  console.error(red("[wolder]"), msg)
}
