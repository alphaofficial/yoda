import { spawn, ChildProcess } from 'node:child_process'

/**
 * Custom dev runner: spawns pages:watch, start:dev:server,
 * start:dev:client, and start:dev:ssr,
 * parses their output, strips noise, and prints uniform pretty logs.
 */

type Tag = 'pages' | 'server' | 'client' | 'ssr'

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const

const TAG_COLOR: Record<Tag, string> = {
  pages: COLORS.magenta,
  server: COLORS.cyan,
  client: COLORS.green,
  ssr: COLORS.blue,
}

// Lines matching these patterns are dropped entirely.
const NOISE: RegExp[] = [
  /^\s*$/,
  /^> \S+@[\d.]+ \S+$/,         // "> superflux@0.1.0 dev"
  /^> .+$/,                      // "> tsx scripts/..."
  /^npm (warn|notice)/i,
  /\[nodemon\] \d+\.\d+\.\d+$/,  // version banner
  /\[nodemon\] to restart at any time/,
  /\[nodemon\] watching (path|extensions)/,
  /\[nodemon\] starting `/,
  /\[nodemon\] clean exit/,
  /^Watching "/,                 // chokidar banner
  /^add:/,                       // chokidar add spam
  /^change:/,
  /^unlink:/,
  /building for production\.\.\./,
  /^watching for file changes\.\.\.$/,
  /^build started\.\.\.$/,
  /^transforming\.\.\.$/,
  /^rendering chunks\.\.\.$/,
  /^computing gzip size\.\.\.$/,
  /modules transformed\./,
  /The public directory feature may not work/,
  /Some chunks are larger than/,
  /Using dynamic import\(\)/,
  /Use build\.rollupOptions/,
  /Adjust chunk size limit/,
  /\[baseline-browser-mapping\]/,
  /^Browserslist:/,
  /npx update-browserslist-db/,
  /update-db#readme/,
  /^public\/.+\s+[\d.]+\s*kB/,  // vite per-asset size report
]

// Lines matching these get elevated formatting.
const HIGHLIGHTS: Array<{ re: RegExp; color: string; label?: string }> = [
  { re: /built in \d+/, color: COLORS.green, label: 'built' },
  { re: /Server running at/, color: COLORS.green, label: 'ready' },
  { re: /error|failed|exception/i, color: COLORS.red },
  { re: /warn/i, color: COLORS.yellow },
]

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))

function timestamp(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

const lastColor: Record<Tag, string> = { pages: COLORS.reset, server: COLORS.reset, client: COLORS.reset, ssr: COLORS.reset }

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g

function printLine(tag: Tag, raw: string) {
  const line = raw.replace(/\r$/, '')
  if (!line) return
  const plain = line.replace(ANSI_RE, '')
  if (!plain.trim()) return
  if (NOISE.some((re) => re.test(plain))) return

  // Continuation lines: indented output (pino err blocks, stack traces, vite
  // indented hints). Print with a hanging indent so the block reads as one.
  const isContinuation = /^\s/.test(line) || /^\}$/.test(line.trim())
  if (isContinuation) {
    const color = lastColor[tag]
    const indent = ' '.repeat(16) // 8 (time) + 1 + 6 (tag) + 1
    process.stdout.write(`${indent}${color}${line.replace(/\s+$/, '')}${COLORS.reset}\n`)
    return
  }

  let color = COLORS.reset
  let labelOverride: string | undefined
  for (const h of HIGHLIGHTS) {
    if (h.re.test(line)) {
      color = h.color
      labelOverride = h.label
      break
    }
  }
  lastColor[tag] = color

  const tagColor = TAG_COLOR[tag]
  const time = `${COLORS.gray}${timestamp()}${COLORS.reset}`
  const label = `${tagColor}${pad(tag, 6)}${COLORS.reset}`
  const prefix = labelOverride
    ? ` ${color}${COLORS.bold}${labelOverride}${COLORS.reset} `
    : ' '
  const body = `${color}${line.trim()}${COLORS.reset}`
  process.stdout.write(`${time} ${label}${prefix}${body}\n`)
}

function makeLineStream(tag: Tag) {
  let buf = ''
  return (chunk: Buffer) => {
    buf += chunk.toString('utf8')
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const l of lines) printLine(tag, l)
  }
}

type Proc = { tag: Tag; cmd: string; args: string[] }

const procs: Proc[] = [
  { tag: 'pages', cmd: 'npx', args: ['chokidar', 'src/views/pages/**/*.tsx', '-c', 'npm run pages:generate --silent', '--initial', '--silent'] },
  { tag: 'server', cmd: 'npx', args: ['nodemon', '--quiet', '--exec', 'tsx src/index.ts'] },
  { tag: 'client', cmd: 'npx', args: ['vite', 'build', '--watch'] },
  { tag: 'ssr', cmd: 'npx', args: ['vite', 'build', '--config', 'vite.ssr.config.mjs', '--watch'] },
]

const children: ChildProcess[] = []

function start() {
  for (const { tag, cmd, args } of procs) {
    const child = spawn(cmd, args, {
      env: { ...process.env, FORCE_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', makeLineStream(tag))
    child.stderr?.on('data', makeLineStream(tag))
    child.on('exit', (code) => {
      printLine(tag, `process exited with code ${code}`)
      shutdown(code ?? 0)
    })
    children.push(child)
  }
}

function shutdown(code = 0) {
  for (const c of children) {
    if (!c.killed) c.kill('SIGTERM')
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

start()
