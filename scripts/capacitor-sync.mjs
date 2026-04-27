import { mkdir, cp, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const distDir = path.resolve('dist')
const iosPublicDir = path.resolve('ios/App/public')

if (!existsSync(distDir)) {
  throw new Error('dist directory not found. Run the web build before cap:sync.')
}

await mkdir(iosPublicDir, { recursive: true })
await cp(distDir, iosPublicDir, { recursive: true })
await writeFile(
  path.resolve('ios/App/capacitor-sync.txt'),
  'Capacitor sync complete: web build copied to ios/App/public.\n'
)

console.log('Capacitor sync complete')
