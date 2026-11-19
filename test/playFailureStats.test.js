/**
 * playFailureStatsCore 单元测试
 *
 * 运行：node test/playFailureStats.test.js
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const ts = require('typescript')

const SRC = path.join(__dirname, '..', 'src', 'core', 'player', 'playFailureStatsCore.ts')

const loadModule = () => {
  const source = fs.readFileSync(SRC, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  })
  const module = { exports: {} }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', outputText)(require, module, module.exports)
  return module.exports
}

const mod = loadModule()
const tests = []
const test = (name, fn) => { tests.push({ name, fn }) }
const music = (id) => ({ id, name: `song-${id}`, singer: 'singer', source: 'tx' })

test('首次记录失败 count=1；去重窗口内重复失败不累加 count', () => {
  let map = {}
  map = mod.recordFailureInMap(map, 'm1', 'source error', 1000)
  assert.strictEqual(map.m1.count, 1)
  map = mod.recordFailureInMap(map, 'm1', 'playback error', 1000 + 30_000)
  assert.strictEqual(map.m1.count, 1)
  assert.strictEqual(map.m1.reason, 'playback error')
})

test('超出 60s 去重窗口后再次失败会累加 count', () => {
  let map = {}
  map = mod.recordFailureInMap(map, 'm1', 'e1', 1000)
  map = mod.recordFailureInMap(map, 'm1', 'e2', 1000 + 61_000)
  map = mod.recordFailureInMap(map, 'm1', 'e3', 1000 + 122_000)
  assert.strictEqual(map.m1.count, 3)
  assert.strictEqual(map.m1.firstAt, 1000)
  assert.strictEqual(map.m1.lastAt, 1000 + 122_000)
})

test('LRU 容量上限淘汰最旧记录', () => {
  let map = {}
  for (let i = 1; i <= 5; i++) {
    map = mod.recordFailureInMap(map, `m${i}`, 'err', i * 1000, 60_000, 3)
  }
  assert.deepStrictEqual(Object.keys(map).sort(), ['m3', 'm4', 'm5'])
})

test('成功起播或清理后 clearFailureInMap 能清除记录', () => {
  let map = {}
  map = mod.recordFailureInMap(map, 'm1', 'err', 1000)
  map = mod.recordFailureInMap(map, 'm2', 'err', 2000)
  const cleared = mod.clearFailureInMap(map, ['m1'])
  assert.strictEqual(cleared.changed, true)
  assert.strictEqual(cleared.map.m1, undefined)
  assert.strictEqual(cleared.map.m2.count, 1)
  const noop = mod.clearFailureInMap(cleared.map, ['not_exist'])
  assert.strictEqual(noop.changed, false)
})

test('filterSuspectFailureMusics 按阈值筛选并排除当前正在播放歌曲', () => {
  const map = {
    a: { count: 3, firstAt: 1, lastAt: 3, reason: 'r1' },
    b: { count: 2, firstAt: 1, lastAt: 2, reason: 'r2' },
    c: { count: 5, firstAt: 1, lastAt: 5, reason: 'r3' },
  }
  const list = [music('a'), music('b'), music('c')]
  const suspects = mod.filterSuspectFailureMusics(list, map, 3, 'c')
  assert.deepStrictEqual(suspects.map(s => s.musicInfo.id), ['a'])
})

let passed = 0
let failed = 0
for (const { name, fn } of tests) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    console.log(`  ✗ ${name}: ${err.message}`)
  }
}
console.log(`\n${passed}/${tests.length} passed`)
if (failed) process.exitCode = 1
