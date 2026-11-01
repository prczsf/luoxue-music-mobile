/**
 * 存储层（分片读写）单元测试
 *
 * 零依赖：用本地 typescript 转译 src/plugins/storage.ts，注入假 AsyncStorage 与假 log。
 * 运行：node test/storage.test.js
 *
 * 覆盖重点：
 * - 分片往返（小值 / 恰好边界 / 超限多分片）
 * - 覆盖写时的旧分片回收（大→小、大→大但分片更少）
 * - 写入失败时旧数据必须完好（当前实现会丢数据，这是本次要修的核心缺陷）
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const ts = require('typescript')

const STORAGE_SRC = path.join(__dirname, '..', 'src', 'plugins', 'storage.ts')
const PART_PREFIX = '@___PART_A___'
/** 与 storage.ts 内部 limit 保持一致 */
const LIMIT = 500000

const createFakeStorage = () => {
  const map = new Map()
  let failMultiSet = false
  let failMultiRemove = false
  return {
    map,
    setFailMultiSet(v) { failMultiSet = v },
    setFailMultiRemove(v) { failMultiRemove = v },
    partKeys() { return [...map.keys()].filter(key => key.startsWith(PART_PREFIX)) },
    async getItem(key) { return map.has(key) ? map.get(key) : null },
    async setItem(key, value) { map.set(key, value) },
    async removeItem(key) { map.delete(key) },
    async multiGet(keys) { return keys.map(key => [key, map.has(key) ? map.get(key) : null]) },
    async multiSet(pairs) {
      if (failMultiSet) throw new Error('multiSet failed (injected)')
      for (const [key, value] of pairs) map.set(key, value)
    },
    async multiRemove(keys) {
      if (failMultiRemove) throw new Error('multiRemove failed (injected)')
      for (const key of keys) map.delete(key)
    },
    async getAllKeys() { return [...map.keys()] },
  }
}

const loadStorage = (fake) => {
  const source = fs.readFileSync(STORAGE_SRC, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  })
  const module = { exports: {} }
  const customRequire = (id) => {
    if (id === '@react-native-async-storage/async-storage') {
      return { __esModule: true, default: fake, useAsyncStorage: () => null }
    }
    if (id === '@/utils/log') {
      return { log: { error: () => {}, info: () => {}, warn: () => {}, log: () => {} } }
    }
    throw new Error(`unexpected require: ${id}`)
  }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', outputText)(customRequire, module, module.exports)
  return module.exports
}

const setup = () => {
  const fake = createFakeStorage()
  return { fake, storage: loadStorage(fake) }
}

const tests = []
const test = (name, fn) => { tests.push({ name, fn }) }

test('小值：往返一致且不产生分片键', async() => {
  const { fake, storage } = setup()
  const value = { a: 1, b: '你好' }
  await storage.saveData('k', value)
  assert.deepStrictEqual(await storage.getData('k'), value)
  assert.deepStrictEqual(fake.partKeys(), [])
})

test('边界：JSON 长度恰好等于 limit 时不分片', async() => {
  const { fake, storage } = setup()
  // JSON.stringify 会给字符串加两个引号
  const value = 'a'.repeat(LIMIT - 2)
  assert.equal(JSON.stringify(value).length, LIMIT)
  await storage.saveData('k', value)
  assert.equal(await storage.getData('k'), value)
  assert.deepStrictEqual(fake.partKeys(), [])
})

test('边界：JSON 长度 limit+1 时分成两片', async() => {
  const { fake, storage } = setup()
  const value = 'a'.repeat(LIMIT - 1)
  assert.equal(JSON.stringify(value).length, LIMIT + 1)
  await storage.saveData('k', value)
  assert.equal(await storage.getData('k'), value)
  assert.equal(fake.partKeys().length, 2)
})

test('大值：多分片往返一致', async() => {
  const { fake, storage } = setup()
  const value = 'x'.repeat(LIMIT * 2 + 1000)
  await storage.saveData('k', value)
  assert.equal(await storage.getData('k'), value)
  assert.ok(fake.partKeys().length >= 3)
})

test('覆盖写：大值 → 小值，旧分片被回收', async() => {
  const { fake, storage } = setup()
  await storage.saveData('k', 'x'.repeat(LIMIT * 2))
  assert.ok(fake.partKeys().length >= 3)
  await storage.saveData('k', 'small')
  assert.equal(await storage.getData('k'), 'small')
  assert.deepStrictEqual(fake.partKeys(), [], '旧分片应被回收')
})

test('覆盖写：大值 → 大值但分片更少，多余分片被回收', async() => {
  const { fake, storage } = setup()
  await storage.saveData('k', 'x'.repeat(LIMIT * 3))
  const before = fake.partKeys().length
  await storage.saveData('k', 'y'.repeat(LIMIT))
  assert.equal(await storage.getData('k'), 'y'.repeat(LIMIT))
  assert.ok(fake.partKeys().length < before, '分片数应减少')
  assert.equal(fake.partKeys().length, 2)
})

test('写入失败：multiSet 抛错时旧值必须完好', async() => {
  const { fake, storage } = setup()
  await storage.saveData('k', 'old-value')
  fake.setFailMultiSet(true)
  await assert.rejects(() => storage.saveData('k', 'new-value'))
  fake.setFailMultiSet(false)
  assert.equal(await storage.getData('k'), 'old-value', '写入失败后旧值被破坏')
})

test('写入失败：分片大值的旧数据也必须完好', async() => {
  const { fake, storage } = setup()
  const oldValue = 'o'.repeat(LIMIT * 2)
  await storage.saveData('k', oldValue)
  fake.setFailMultiSet(true)
  await assert.rejects(() => storage.saveData('k', 'new'))
  fake.setFailMultiSet(false)
  assert.equal(await storage.getData('k'), oldValue, '写入失败后分片旧值被破坏')
})

test('多键写入失败：任一键都不应被破坏（自定义源三键场景）', async() => {
  const { fake, storage } = setup()
  const before = [['@user_api__', ['src-a']], ['@user_api__src-a', 'script-v1'], ['@user_api__src-a__prev', 'script-v0']]
  await storage.saveDataMultiple(before)

  fake.setFailMultiSet(true)
  await assert.rejects(() => storage.saveDataMultiple([
    ['@user_api__', ['src-a', 'src-b']],
    ['@user_api__src-a', 'script-v2'],
    ['@user_api__src-a__prev', 'script-v1'],
  ]))
  fake.setFailMultiSet(false)

  assert.deepStrictEqual(await storage.getData('@user_api__'), ['src-a'], '源列表被破坏')
  assert.equal(await storage.getData('@user_api__src-a'), 'script-v1', '源脚本被破坏')
  assert.equal(await storage.getData('@user_api__src-a__prev'), 'script-v0', '上一版脚本被破坏')
})

test('删除失败不应导致数据不可读', async() => {
  const { fake, storage } = setup()
  await storage.saveData('k', 'x'.repeat(LIMIT * 2))
  fake.setFailMultiRemove(true)
  // 清理旧分片失败只应留下孤儿分片，读到的值必须仍是新的
  await storage.saveData('k', 'new-value').catch(() => {})
  fake.setFailMultiRemove(false)
  assert.equal(await storage.getData('k'), 'new-value')
})

const run = async() => {
  let passed = 0
  const failures = []
  for (const { name, fn } of tests) {
    try {
      await fn()
      passed++
      console.log(`  ✓ ${name}`)
    } catch (error) {
      failures.push({ name, error })
      console.log(`  ✗ ${name}`)
      console.log(`      ${error.message}`)
    }
  }
  console.log(`\n${passed}/${tests.length} passed`)
  if (failures.length) {
    console.log('\n失败项：')
    for (const { name, error } of failures) console.log(`  - ${name}: ${error.message}`)
    process.exitCode = 1
  }
}

void run()
