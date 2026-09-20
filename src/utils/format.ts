export function fmt(n: number): string {
  return n.toLocaleString()
}

export function fmtMoney(n: number): string {
  return `${fmt(Math.round(n))} cr`
}

export function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`
}