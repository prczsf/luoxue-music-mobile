

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
      /** 规范化后的规则文本（小写、@→#、去重），只用于匹配 */
      rules: DislikeRules
      /** 用户输入的原始规则文本，用于展示、编辑与持久化，避免把用户的写法改掉 */
      rawRules: DislikeRules
    }
  }
}
