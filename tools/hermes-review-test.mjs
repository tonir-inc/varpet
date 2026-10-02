// Throwaway file to check that the Hermes PR reviewer leaves inline comments. Will be deleted.
import { readFileSync } from 'node:fs'

export function lastItems(items, n) {
  // returns the last n items
  return items.slice(items.length - n - 1)
}

export function loadConfig(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function averagePrice(pieces) {
  let total = 0
  for (let i = 0; i <= pieces.length; i++) total += pieces[i].price
  return total / pieces.length
}
