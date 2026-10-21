

declare namespace LX {
  namespace Dislike {
    // interface ListItemMusicText {
    //   id?: string
    //   // type: 'music'
    //   name: string | null
    //   singer: string | null
    // }
    // interface ListItemMusic {
    //   id?: number
    //   type: 'musicId'
    //   musicId: string
    //   meta: LX.Music.MusicInfo
    // }
    // type ListItem = ListItemMusicText
    // type ListItem = string
    // type ListItem = ListItemMusic | ListItemMusicText

    interface DislikeMusicInfo {
      name: string
      singer: string
    }

    type DislikeRules = string

    interface DislikeInfo {
      // musicIds: Set<string>
      names: Set<string>
      musicNames: Set<string>
      singerNames: Set<string>
      /** 歌手「包含」匹配规则（`@歌手`，长度 >= 2 才会进入此列） */
      singerKeywords: string[]
      /** 歌名关键词「包含」匹配规则（`~关键词`，长度 >= 2 才会进入此列） */
      nameKeywords: string[]
      // list: LX.Dislike.ListItem[]
      rules: DislikeRules
    }
  }
}
