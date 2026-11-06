// Minimal asar reader for DSH inspection (read-only helper).
// Usage: node asar-extract.js <asarPath> <outDir> <pathPrefix>...
const fs = require('fs')
const path = require('path')

const asarPath = process.argv[2]
const outDir = process.argv[3]
const prefixes = process.argv.slice(4)

const fd = fs.openSync(asarPath, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
// asar header layout: u32 @0 = 4, u32 @4 = headerSize, u32 @8 = header JSON size,
// u32 @12 = headerSize - 4. The JSON starts at byte 16 and its padded length is
// the JSON size field, so file data begins at 16 + jsonSize - 4.
const jsonSize = head.readUInt32LE(8)
const dataOffset = 16 + jsonSize - 4
const jsonBuf = Buffer.alloc(jsonSize)
fs.readSync(fd, jsonBuf, 0, jsonSize, 16)

let text = jsonBuf.toString('utf8')
let depth = 0, end = -1, inStr = false, esc = false
for (let i = 0; i < text.length; i++) {
  const c = text[i]
  if (inStr) {
    if (esc) esc = false
    else if (c === '\\') esc = true
    else if (c === '"') inStr = false
    continue
  }
  if (c === '"') inStr = true
  else if (c === '{') depth++
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break } }
}
if (end < 0) throw new Error('could not find end of asar header JSON')
const header = JSON.parse(text.slice(0, end))

const files = []
function walk(node, prefix) {
  for (const k of Object.keys(node.files || {})) {
    const v = node.files[k]
    const full = prefix + '/' + k
    if (v.files) walk(v, full)
    else files.push({ path: full, offset: Number(v.offset), size: v.size, unpacked: v.unpacked })
  }
}
walk(header, '')

function readFile(entry) {
  if (entry.unpacked) {
    return fs.readFileSync(path.join(path.dirname(asarPath).replace(/\.asar$/, '.asar.unpacked'), entry.path))
  }
  const buf = Buffer.alloc(entry.size)
  fs.readSync(fd, buf, 0, entry.size, dataOffset + entry.offset)
  return buf
}

const targets = files.filter((f) => prefixes.some((p) => f.path.includes(p)))
for (const f of targets) {
  const rel = f.path.replace(/^\/dsh\/node_modules\/@deepseek-ai\/dsh-agent-preset\/skills\/cordis-plugin-development\/templates\/decoration\//, '')
  const dest = path.join(outDir, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, readFile(f))
  console.log(`${f.size}\t${rel}`)
}
console.log(`extracted ${targets.length} files to ${outDir}`)
