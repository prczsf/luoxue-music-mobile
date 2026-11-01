/**
 * filterMusicList / filterList 的分支组合测试
 *
 * 这段逻辑是「当前歌被屏蔽」×「已播列表空/非空」×「列表长度」的三层嵌套，
 * 终止性靠阅读无法确认，用表驱动断言锁住：
 * - 被屏蔽 / 不可播放的歌不能出现在候选里（当前歌允许在中间态出现，随后必须被剔除）
 * - playerIndex 必须落在合法区间，不能指向 undefined
 * - 全部不可播放时必须返回空列表（否则 playNext 会反复重播同一首）
 *
 * 运行：node test/filterMusicList.test.js
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const ts = require('typescript')

const SRC = path.join(__dirname, '..', 'src', 'core', 'player', 'utils.ts')

const loadModule = (stubs) => {
  const source = fs.readFileSync(SRC, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  })
  const module = { exports: {} }
  const customRequire = (id) => {
    if (id === './playedList') return { clearPlayedList: stubs.clearPlayedList }
    if (id === './invalidMusic') return { isMusicInvalid: (m) => stubs.invalidIds.has(m.id) }
    if (id === '@/utils/dislikeMatch') return { hasDislikeFor: (info, m) => stubs.blockedIds.has(m.id) }
    if (id === '@/store/dislikeList') return { state: { dislikeInfo: {} } }
    throw new Error(`unexpected require: ${id}`)
  }
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', outputText)(customRequire, module, module.exports)
  return module.exports
}

const music = (id) => ({ id, name: id, singer: 's', source: 'tx' })

const makeSetup = ({ blocked = [], invalid = [], played = [] } = {}) => {
  const stubs = {
    blockedIds: new Set(blocked),
    invalidIds: new Set(invalid),
    clearPlayedList: () => { stubs.cleared = true },
    cleared: false,
  }
  return { mod: loadModule(stubs), stubs, played }
}

const tests = []
const test = (name, fn) => { tests.push({ name, fn }) }

/**
 * 下标约定（由 playNext / playPrev 的消费方式决定）：
 * - isNext=true  ：调用方取 filteredList[playerIndex + 1]，所以 playerIndex 最大为 len-1
 * - isNext=false ：调用方取 filteredList[playerIndex - 1]，当前歌被移除时 playerIndex 可以等于 len
 */
const assertInvariants = (result, list, blockedIds, isNext) => {
  const { filteredList, playerIndex } = result
  for (const item of filteredList) {
    assert.ok(item, '候选里出现了 undefined')
    assert.ok(!blockedIds.has(item.id), `候选里出现了被屏蔽/不可播放的歌：${item.id}`)
  }
  const maxIndex = isNext ? filteredList.length - 1 : filteredList.length
  assert.ok(playerIndex >= -1 && playerIndex <= maxIndex,
    `playerIndex 越界：${playerIndex} / len=${filteredList.length} / isNext=${isNext}`)
  assert.ok(!list.includes(undefined), '原列表被污染')
}

test('无屏蔽无已播：候选等于原列表，下标指向当前歌', () => {
  const { mod } = makeSetup()
  const list = [music('a'), music('b'), music('c')]
  const result = mod.filterMusicList({
    playedList: [], listId: 'l', list, playerMusicInfo: list[0], dislikeInfo: {}, isNext: true,
  })
  assert.deepStrictEqual(result.filteredList.map(m => m.id), ['a', 'b', 'c'])
  assert.strictEqual(result.playerIndex, 0)
})

test('当前歌被屏蔽（无已播）：候选不含当前歌，下标合法', () => {
  const { mod, stubs } = makeSetup({ blocked: ['a'] })
  const list = [music('a'), music('b'), music('c')]
  const result = mod.filterMusicList({
    playedList: [], listId: 'l', list, playerMusicInfo: list[0], dislikeInfo: {}, isNext: true,
  })
  assert.deepStrictEqual(result.filteredList.map(m => m.id), ['b', 'c'])
  assertInvariants(result, list, stubs.blockedIds, true)
})

test('中间歌被屏蔽：候选跳过它', () => {
  const { mod, stubs } = makeSetup({ blocked: ['b'] })
  const list = [music('a'), music('b'), music('c')]
  const result = mod.filterMusicList({
    playedList: [], listId: 'l', list, playerMusicInfo: list[0], dislikeInfo: {}, isNext: true,
  })
  assert.deepStrictEqual(result.filteredList.map(m => m.id), ['a', 'c'])
  assertInvariants(result, list, stubs.blockedIds, true)
})

test('不可播放标记与屏蔽等效：同样被剔除', () => {
  const { mod, stubs } = makeSetup({ invalid: ['c'] })
  const list = [music('a'), music('b'), music('c')]
  const result = mod.filterMusicList({
    playedList: [], listId: 'l', list, playerMusicInfo: list[0], dislikeInfo: {}, isNext: true,
  })
  assert.deepStrictEqual(result.filteredList.map(m => m.id), ['a', 'b'])
  assertInvariants(result, list, stubs.invalidIds, true)
})

test('只剩当前歌且它被屏蔽：候选必须为空（否则会无限重播同一首）', () => {
  const { mod } = makeSetup({ blocked: ['a'] })
  const list = [music('a')]
  const result = mod.filterMusicList({
    playedList: [], listId: 'l', list, playerMusicInfo: list[0], dislikeInfo: {}, isNext: true,
  })
  assert.deepStrictEqual(result.filteredList.map(m => m.id), [], '候选不为空会导致无限重播')
})

test('全部被屏蔽：filterList 返回空（含已播列表非空的情况）', async() => {
  const { mod } = makeSetup({ blocked: ['a', 'b', 'c'] })
  const list = [music('a'), music('b'), music('c')]
  const playedList = [{ listId: 'l', isTempPlay: false, musicInfo: music('a') }]
  const result = await mod.filterList({
    playedList, listId: 'l', list, playerMusicInfo: list[0], isNext: true,
  })
  assert.deepStrictEqual(result.filteredList.map(m => m.id), [], '全部不可播放时仍返回了候选')
})

test('已播列表非空：已播歌被剔除，当前歌保留', async() => {
  const { mod } = makeSetup()
  const list = [music('a'), music('b'), music('c')]
  const playedList = [{ listId: 'l', isTempPlay: false, musicInfo: music('b') }]
  const result = await mod.filterList({
    playedList, listId: 'l', list, playerMusicInfo: list[0], isNext: true,
  })
  const ids = result.filteredList.map(m => m.id)
  assert.ok(ids.includes('a'), '当前歌应保留')
  assert.ok(!ids.includes('b'), '已播歌应被剔除')
})

test('穷举：3 首歌 × 屏蔽组合 × 已播组合，全部满足不变式', () => {
  const ids = ['a', 'b', 'c']
  const list = ids.map(music)
  const subsets = (arr) => arr.reduce((acc, x) => acc.concat(acc.map(s => [...s, x])), [[]])
  for (const blocked of subsets(ids)) {
    for (const playedIds of subsets(ids)) {
      for (const isNext of [true, false]) {
        for (const currentIndex of [0, 1, 2]) {
          const { mod, stubs } = makeSetup({ blocked })
          const playedList = playedIds.map(id => ({ listId: 'l', isTempPlay: false, musicInfo: music(id) }))
          const result = mod.filterMusicList({
            playedList, listId: 'l', list, playerMusicInfo: list[currentIndex], dislikeInfo: {}, isNext,
          })
          assertInvariants(result, list, stubs.blockedIds, isNext)
          // 当前歌被屏蔽时，候选里不允许残留它
          if (blocked.includes(ids[currentIndex])) {
            assert.ok(!result.filteredList.some(m => m.id == ids[currentIndex]),
              `当前歌被屏蔽却仍留在候选：blocked=${blocked} played=${playedIds} isNext=${isNext}`)
          }
        }
      }
    }
  }
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
