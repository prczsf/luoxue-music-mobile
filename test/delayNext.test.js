/**
 * delayNext 单一计时器与代际取消测试
 *
 * 运行：node test/delayNext.test.js
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const ts = require('typescript')

const SRC = path.join(__dirname, '..', 'src', 'core', 'player', 'delayNext.ts')

const loadModule = () => {
  const source = fs.readFileSync(SRC, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  })

  let nextId = 1
  const timers = new Map()
  const mockTimer = {
    setTimeout(fn) {
      const id = nextId++
      timers.set(id, fn)
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    flushAll() {
      const entries = Array.from(timers.entries())
      timers.clear()
      for (const [, fn] of entries) fn()
    },
    activeCount() {
      return timers.size
    },
  }

  const module = { exports: {} }
  const customRequire = (id) => {
    if (id === 'react-native-background-timer') return mockTimer
    throw new Error(`unexpected require: ${id}`)
  }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', outputText)(customRequire, module, module.exports)
  return { mod: module.exports, mockTimer }
}

const tests = []
const test = (name, fn) => { tests.push({ name, fn }) }

test('后一次 scheduleDelayNext 覆盖前一次，只触发最后一次回调', () => {
  const { mod, mockTimer } = loadModule()
  const calls = []
  mod.scheduleDelayNext(() => calls.push('first'), 2000)
  mod.scheduleDelayNext(() => calls.push('second'), 2000)
  assert.strictEqual(mockTimer.activeCount(), 1)
  mockTimer.flushAll()
  assert.deepStrictEqual(calls, ['second'])
})

test('cancelDelayNext 取消后不再触发任何已排队的回调', () => {
  const { mod, mockTimer } = loadModule()
  const calls = []
  mod.scheduleDelayNext(() => calls.push('pending'), 2000)
  mod.cancelDelayNext()
  assert.strictEqual(mockTimer.activeCount(), 0)
  mockTimer.flushAll()
  assert.deepStrictEqual(calls, [])
})

test('已取出待执行但尚未执行到的旧代际回调也会被代际号拦截', () => {
  const { mod, mockTimer } = loadModule()
  let captured = null
  const origSetTimeout = mockTimer.setTimeout
  mockTimer.setTimeout = (fn) => {
    captured = fn
    return origSetTimeout(fn)
  }
  const calls = []
  mod.scheduleDelayNext(() => calls.push('stale'), 2000)
  const staleFn = captured
  mod.cancelDelayNext()
  // 模拟定时器队列边界已被调度出去的旧回调
  staleFn()
  assert.deepStrictEqual(calls, [])
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
