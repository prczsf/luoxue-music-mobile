/**
 * 合唱曲用这些字符连接多个歌手（如 `周杰伦、费玉清`）
 * 与 roaming 索引的拆分规则保持一致，避免同一份字符串在不同模块被拆成不同结果
 */
export const SINGER_SPLIT_RXP = /[/、&;，,]/

/** 拆分歌手字段（合唱挂多个歌手名） */
export const splitSingers = (singer?: string): string[] => {
  if (!singer) return []
  return singer.split(SINGER_SPLIT_RXP).map(s => s.trim()).filter(s => s.length > 0)
}
