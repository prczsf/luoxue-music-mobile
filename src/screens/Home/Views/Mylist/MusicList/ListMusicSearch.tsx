import { useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react'
import SearchTipList, { type SearchTipListProps as _SearchTipListProps, type SearchTipListType } from '@/components/SearchTipList'
import { debounce } from '@/utils'
import { useI18n } from '@/lang'
import { searchListMusic } from './listAction'
import Button from '@/components/common/Button'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { View } from 'react-native'
import { scaleSizeH } from '@/utils/pixelRatio'
import { getListMusics } from '@/core/list'
import listState from '@/store/list/state'

type SearchTipListProps = _SearchTipListProps<LX.Music.MusicInfo>
interface ListMusicSearchProps {
  onPlay: (info: LX.Music.MusicInfo) => void
}
export const ITEM_HEIGHT = scaleSizeH(46)

export interface ListMusicSearchType {
  search: (keyword: string, height: number) => void
  hide: () => void
}

export const debounceSearchList = debounce((text: string, list: LX.List.ListMusics, callback: (list: LX.List.ListMusics) => void) => {
  // console.log(reslutList)
  callback(searchListMusic(list, text))
}, 200)


export default forwardRef<ListMusicSearchType, ListMusicSearchProps>(({ onPlay }, ref) => {
  const searchTipListRef = useRef<SearchTipListType<LX.Music.MusicInfo>>(null)
  const [visible, setVisible] = useState(false)
  const currentListIdRef = useRef('')
  const currentKeywordRef = useRef('')
  const theme = useTheme()
  const t = useI18n()
  const [keyword, setKeyword] = useState('')
  const [resultCount, setResultCount] = useState(0)

  const handleShowList = (keyword: string, height: number) => {
    searchTipListRef.current?.setHeight(height)
    currentKeywordRef.current = keyword
    setKeyword(keyword)
    const id = currentListIdRef.current = listState.activeListId
    if (keyword) {
      void getListMusics(id).then(list => {
        debounceSearchList(keyword, list, (list) => {
          if (currentListIdRef.current != id) return
          setResultCount(list.length)
          searchTipListRef.current?.setList(list)
        })
      })
    } else {
      setResultCount(0)
      searchTipListRef.current?.setList([])
    }
  }

  useImperativeHandle(ref, () => ({
    search(keyword, height) {
      if (visible) handleShowList(keyword, height)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          handleShowList(keyword, height)
        })
      }
    },
    hide() {
      currentKeywordRef.current = ''
      currentListIdRef.current = ''
      setKeyword('')
      setResultCount(0)
      searchTipListRef.current?.setList([])
    },
  }))

  useEffect(() => {
    const updateList = (id: string) => {
      currentListIdRef.current = id
      if (!currentKeywordRef.current) return
      void getListMusics(listState.activeListId).then(list => {
        debounceSearchList(currentKeywordRef.current, list, (list) => {
          if (currentListIdRef.current != id) return
          setResultCount(list.length)
          searchTipListRef.current?.setList(list)
        })
      })
    }
    const handleChange = (ids: string[]) => {
      if (!ids.includes(listState.activeListId)) return
      updateList(listState.activeListId)
    }

    global.state_event.on('mylistToggled', updateList)
    global.app_event.on('myListMusicUpdate', handleChange)

    return () => {
      global.state_event.off('mylistToggled', updateList)
      global.app_event.off('myListMusicUpdate', handleChange)
    }
  }, [])

  const renderItem = ({ item, index }: { item: LX.Music.MusicInfo, index: number }) => {
    return (
      <Button style={styles.item} onPress={() => { onPlay(item) }} key={index}>
        <View style={styles.itemName}>
          <Text numberOfLines={1}>{item.name}</Text>
          <Text style={styles.subName} numberOfLines={1} size={12} color={theme['c-font-label']}>{item.singer} ({item.meta.albumName})</Text>
        </View>
        <Text style={styles.itemSource} size={12} color={theme['c-font-label']}>{item.source}</Text>
      </Button>
    )
  }
  const getkey: SearchTipListProps['keyExtractor'] = item => item.id
  const getItemLayout: SearchTipListProps['getItemLayout'] = (data, index) => {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }
  }

  return (
    visible
      ? <>
          <SearchTipList
            ref={searchTipListRef}
            renderItem={renderItem}
            onPressBg={() => searchTipListRef.current?.setList([])}
            keyExtractor={getkey}
            getItemLayout={getItemLayout}
          />
          {keyword && !resultCount
            ? <View style={{ ...styles.emptyContainer, backgroundColor: theme['c-content-background'] }}>
                <Text size={13} color={theme['c-font-label']}>{t('list_search_empty')}</Text>
              </View>
            : null}
        </>
      : null
  )
})


const styles = createStyle({
  item: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 15,
    // backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  itemName: {
    flexGrow: 1,
    flexShrink: 1,
  },
  subName: {
    marginTop: 2,
  },
  itemSource: {
    flexGrow: 0,
    flexShrink: 0,
  },
  emptyContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    paddingTop: scaleSizeH(56),
    paddingBottom: 20,
    alignItems: 'center',
    zIndex: 11,
  },
})

