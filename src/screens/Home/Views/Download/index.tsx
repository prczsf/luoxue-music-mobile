import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import MusicAddModal, { type MusicAddModalType } from '@/components/MusicAddModal'

import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { LIST_IDS } from '@/config/constant'
import { getDownloadDir } from '@/core/downloadPath'
import { playList } from '@/core/player/player'
import { setTempList } from '@/core/list'
import { unlink } from '@/utils/fs'
import { readMetadata, scanAudioFiles } from '@/utils/localMediaMetadata'
import { buildLocalMusicInfo, buildLocalMusicInfoByFilePath } from '@/screens/Home/Views/Mylist/MyList/listAction'
import { checkStoragePermissions, confirmDialog, createStyle, requestStoragePermission, toast } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'

/**
 * 我的下载（Home 内页，与其它侧边栏项同一布局：共用 Home 顶部栏 / PlayerBar / 抽屉）
 * - 扫描下载目录音频文件：先按文件名秒级上屏，再异步补全 metadata
 * - 点行播放、[⋮] 添加到歌单 / 删除本地文件
 */
export default memo(() => {
  const theme = useTheme()
  const t = useI18n()

  const [rawList, setRawList] = useState<LX.Music.MusicInfoLocal[]>([])
  const [loading, setLoading] = useState(false)
  const [searchKey, setSearchKey] = useState('')
  const [downloadDir, setDownloadDir] = useState('')

  // 选中的单曲操作
  const [selectedMusic, setSelectedMusic] = useState<LX.Music.MusicInfoLocal | null>(null)
  const musicAddModalRef = useRef<MusicAddModalType>(null)

  const loadDownloads = useCallback(async() => {
    setLoading(true)
    try {
      const hasPerm = await checkStoragePermissions()
      if (!hasPerm) {
        const granted = await requestStoragePermission()
        if (!granted) {
          toast(t('storage_permission_tip_request'))
          setLoading(false)
          return
        }
      }

      const dir = await getDownloadDir()
      setDownloadDir(dir)
      const files = await scanAudioFiles(dir)
      if (!files.length) {
        setRawList([])
        setLoading(false)
        return
      }

      // 先用文件名秒级构造基础信息上屏，避免卡顿
      const initialInfos = files.map(buildLocalMusicInfoByFilePath)
      setRawList(initialInfos)
      setLoading(false)

      // 异步分批解析 metadata，静默丰富歌手与专辑信息
      void (async() => {
        const enriched: LX.Music.MusicInfoLocal[] = []
        for (const file of files) {
          try {
            const meta = await readMetadata(file.path)
            if (meta) enriched.push(buildLocalMusicInfo(file.path, meta))
            else enriched.push(buildLocalMusicInfoByFilePath(file))
          } catch {
            enriched.push(buildLocalMusicInfoByFilePath(file))
          }
        }
        setRawList(enriched)
      })()
    } catch {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadDownloads()
  }, [loadDownloads])

  // 搜索过滤后的列表
  const filteredList = useMemo(() => {
    const k = searchKey.trim().toLowerCase()
    if (!k) return rawList
    return rawList.filter(m =>
      m.name.toLowerCase().includes(k) ||
      (m.singer && m.singer.toLowerCase().includes(k)) ||
      m.meta.filePath.toLowerCase().includes(k),
    )
  }, [rawList, searchKey])

  // 单击单曲：载入播放队列并从当前 index 开始顺序播放
  const handlePlayMusic = async(index: number) => {
    if (!filteredList.length) return
    await setTempList(LIST_IDS.DOWNLOAD, [...filteredList])
    void playList(LIST_IDS.TEMP, index)
  }

  // 播放全部
  const handlePlayAll = async() => {
    if (!filteredList.length) {
      toast(t('list_empty_play_tip'))
      return
    }
    await setTempList(LIST_IDS.DOWNLOAD, [...filteredList])
    void playList(LIST_IDS.TEMP, 0)
  }

  // 删除本地单曲文件
  const handleDeleteMusic = async(musicInfo: LX.Music.MusicInfoLocal) => {
    setSelectedMusic(null)
    const confirm = await confirmDialog({
      message: `${t('delete_file_confirm') ?? '确定要彻底删除该音频文件吗？'}\n${musicInfo.name}`,
      confirmButtonText: t('confirm_button_text'),
      cancelButtonText: t('list_import_part_button_cancel'),
    })
    if (!confirm) return

    try {
      await unlink(musicInfo.meta.filePath)
      setRawList(prev => prev.filter(m => m.meta.filePath !== musicInfo.meta.filePath))
      toast(t('delete_success') ?? '删除成功')
    } catch {
      toast(t('delete_failed') ?? '删除失败')
    }
  }

  // 添加到歌单
  const handleAddToUserList = (musicInfo: LX.Music.MusicInfoLocal) => {
    setSelectedMusic(null)
    musicAddModalRef.current?.show({ musicInfo, isMove: false, listId: '' })
  }

  const renderItem = ({ item, index }: { item: LX.Music.MusicInfoLocal, index: number }) => (
    <TouchableOpacity
      style={[styles.listItem, { borderBottomColor: theme['c-border-background'] }]}
      activeOpacity={0.7}
      onPress={() => { void handlePlayMusic(index) }}
    >
      <Text style={styles.itemIndex} size={13} color={theme['c-font-label']}>
        {index + 1}
      </Text>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} size={15} color={theme['c-font']} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.itemMetaRow}>
          {item.meta.ext ? (
            <View style={[styles.extBadge, { backgroundColor: theme['c-primary-background-hover'] }]}>
              <Text size={10} color={theme['c-primary-font']}>
                {item.meta.ext.toUpperCase()}
              </Text>
            </View>
          ) : null}
          <Text style={styles.itemSinger} size={12} color={theme['c-font-label']} numberOfLines={1}>
            {item.singer || t('unknown_singer') || '未知歌手'}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.moreBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={() => { setSelectedMusic(item) }}
      >
        <Icon name="dots-vertical" color={theme['c-350']} size={16} />
      </TouchableOpacity>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      {/* 操作栏与搜索栏 */}
      <View style={[styles.controlBar, { borderBottomColor: theme['c-border-background'] }]}>
        <Button style={styles.playAllBtn} onPress={() => { void handlePlayAll() }}>
          <Icon name="play-outline" size={16} color={theme['c-button-font']} style={{ marginRight: 6 }} />
          <Text size={14} color={theme['c-button-font']}>
            {t('play_all')}
          </Text>
        </Button>
        <View style={[styles.searchBox, { backgroundColor: theme['c-content-background'], borderColor: theme['c-border-background'] }]}>
          <Icon name="search-2" size={14} color={theme['c-font-label']} style={{ marginRight: 6 }} />
          <TextInput
            style={[styles.searchInput, { color: theme['c-font'] }]}
            placeholder={t('search_music_placeholder') ?? '搜索已下载歌曲...'}
            placeholderTextColor={theme['c-font-label']}
            value={searchKey}
            onChangeText={setSearchKey}
            returnKeyType="search"
          />
          {searchKey ? (
            <TouchableOpacity onPress={() => { setSearchKey('') }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Icon name="close" size={13} color={theme['c-350']} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => { void loadDownloads() }}>
          <Icon name="refresh" size={19} color={theme['c-button-font']} />
        </TouchableOpacity>
      </View>

      {/* 列表区 */}
      <View style={styles.content}>
        {filteredList.length ? (
          <FlatList
            data={filteredList}
            renderItem={renderItem}
            keyExtractor={item => item.meta.filePath}
            refreshing={loading}
            onRefresh={() => { void loadDownloads() }}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Icon name="download-2" size={48} color={theme['c-350']} style={{ marginBottom: 12 }} />
            <Text size={15} color={theme['c-font-label']} style={{ marginBottom: 6 }}>
              {loading ? (t('loading') ?? '正在扫描已下载歌曲...') : (t('download_empty_tip') ?? '当前下载目录暂无音频文件')}
            </Text>
            {downloadDir ? (
              <Text size={11} color={theme['c-350']} style={{ textAlign: 'center', paddingHorizontal: 32 }}>
                {downloadDir}
              </Text>
            ) : null}
            {!loading ? (
              <Button style={styles.rescanBtn} onPress={() => { void loadDownloads() }}>
                <Text size={13} color={theme['c-button-font']}>
                  {t('refresh_scan') ?? '重新扫描'}
                </Text>
              </Button>
            ) : null}
          </View>
        )}
      </View>

      {/* 底部单曲弹窗操作菜单 */}
      {selectedMusic ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => { setSelectedMusic(null) }}
        >
          <TouchableWithoutFeedback onPress={() => { setSelectedMusic(null) }}>
            <View style={styles.modalMask}>
              <TouchableWithoutFeedback>
                <View style={[styles.modalCard, { backgroundColor: theme['c-content-background'] }]}>
                  <Text size={15} style={{ fontWeight: 'bold', marginBottom: 14 }} color={theme['c-font']} numberOfLines={1}>
                    {selectedMusic.name}
                  </Text>
                  <TouchableOpacity
                    style={styles.modalActionItem}
                    onPress={() => { handleAddToUserList(selectedMusic) }}
                  >
                    <Icon name="add-music" size={18} color={theme['c-font']} style={{ marginRight: 12 }} />
                    <Text size={14} color={theme['c-font']}>
                      {t('add_to_playlist') ?? '添加到歌单'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalActionItem}
                    onPress={() => { void handleDeleteMusic(selectedMusic) }}
                  >
                    <Icon name="remove" size={18} color={theme['c-primary-font']} style={{ marginRight: 12 }} />
                    <Text size={14} color={theme['c-primary-font']}>
                      {t('delete_local_file') ?? '删除本地音频'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      ) : null}

      <MusicAddModal ref={musicAddModalRef} />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSizeW(12),
    paddingVertical: scaleSizeH(8),
    borderBottomWidth: BorderWidths.normal,
  },
  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSizeW(12),
    height: scaleSizeH(34),
    borderRadius: 4,
    marginRight: scaleSizeW(10),
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: scaleSizeH(34),
    borderRadius: 4,
    borderWidth: BorderWidths.normal,
    paddingHorizontal: scaleSizeW(8),
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 12,
  },
  refreshBtn: {
    width: scaleSizeW(34),
    height: scaleSizeH(34),
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingBottom: scaleSizeH(16),
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: scaleSizeH(56),
    paddingHorizontal: scaleSizeW(12),
    borderBottomWidth: BorderWidths.normal,
  },
  itemIndex: {
    width: scaleSizeW(32),
    textAlign: 'center',
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: scaleSizeW(8),
  },
  itemName: {
    marginBottom: 2,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  extBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    marginRight: 6,
  },
  itemSinger: {
    flex: 1,
  },
  moreBtn: {
    width: scaleSizeW(36),
    height: scaleSizeH(36),
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: scaleSizeH(80),
  },
  rescanBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    height: scaleSizeH(34),
    borderRadius: 4,
  },
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 16,
    paddingBottom: 28,
  },
  modalActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: scaleSizeH(46),
  },
})
