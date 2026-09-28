/* =====================================================================
   Funds Lab — проверка сгенерированных страниц через W3C Nu Validator.
   Запуск:  node static/validate.mjs
   Требуется интернет. Скрипт отправляет каждый .html из site/ на
   https://validator.w3.org/nu/ и печатает найденные ошибки.
   ===================================================================== */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'site')
const ENDPOINT = 'https://validator.w3.org/nu/?out=json'

const files = readdirSync(OUT).filter((name) => name.endsWith('.html'))

let failed = 0

for (const name of files) {
  const html = readFileSync(join(OUT, name), 'utf8')
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html,
    })
    const result = await response.json()
    const errors = (result.messages || []).filter((m) => m.type === 'error')
    if (errors.length) {
      failed++
      console.log(`\n[ОШИБКИ] ${name}`)
      errors.forEach((m) => console.log(`  строка ${m.lastLine || '?'}: ${m.message}`))
    } else {
      console.log(`[OK]     ${name}`)
    }
  } catch (error) {
    console.log(`[СЕТЬ]   ${name}: ${error.message}`)
  }
}

console.log(`\nПроверено файлов: ${files.length}, с ошибками: ${failed}`)
process.exitCode = failed ? 1 : 0
