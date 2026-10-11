import { createList, setTempList } from '@/core/list'
import { playList } from '@/core/player/player'
import { getListDetail, getListDetailAll } from '@/core/songlist'
import { LIST_IDS } from '@/config/constant'
import listState from '@/store/list/state'
import syncSourceList from '@/core/syncSourceList'
import { confirmDialog, toMD5, toast } from '@/utils/tools'
import songlistState, { type Source } from '@/store/songlist/state'

const getListId = (id: string, source: LX.OnlineSource) => `${source}__${id}`

export const handlePlay = async(id: string, source: Source, list?: LX.Music.MusicInfoOnline[], index = 0) => {
  const listId = getListId(id, source)
  let isPlayingList = false
  // console.log(list)
  if (!list?.length) list = (await getListDetail(id, source, 1)).list
  if (list?.length) {
    await setTempList(listId, [...list])
    void playList(LIST_IDS.TEMP, index)
    isPlayingList = true
  }
  const fullList = await getListDetailAll(source, id)
  if (!fullList.length) return
  if (isPlayingList) {
    if (listState.tempListMeta.id == listId) {
      await setTempList(listId, [...fullList])
    }
  } else {
    await setTempList(listId, [...fullList])
    void playList(LIST_IDS.TEMP, index)
  }
}

export const handleCollect = async(id: string, source: Source, name: string) => {
  const listId = getListId(id, source)
  const targetId = `${source}_${toMD5(listId)}`

  const targetList = listState.userList.find(l => (l.source == source && l.sourceListId == id) || l.id == targetId)
  if (targetList) {
    const confirm = await confirmDialog({
      message: global.i18n.t('duplicate_list_tip', { name: targetList.name }),
      cancelButtonText: global.i18n.t('list_import_part_button_cancel'),
      confirmButtonText: global.i18n.t('confirm_button_text'),
    })
    if (!confirm) return
    void syncSourceList(targetList)
    return
  }

  // 若当前页面已有歌曲列表缓存，先作为初始歌曲落库，避免歌单墙显示 0 首或详情为空
  const initialList = (songlistState.listDetailInfo.id == id && songlistState.listDetailInfo.source == source && songlistState.listDetailInfo.list.length)
    ? songlistState.listDetailInfo.list
    : []

  const newListInfo: LX.List.UserListInfo = {
    id: targetId,
    name,
    source,
    sourceListId: id,
    locationUpdateTime: Date.now(),
  }

  await createList({
    name,
    id: targetId,
    list: initialList,
    source,
    sourceListId: id,
  })
  toast(global.i18n.t('collect_success'))

  // 静默执行一次歌单更新，把新加的歌单完整替换成在线列表的歌曲
  void syncSourceList(newListInfo)
}

