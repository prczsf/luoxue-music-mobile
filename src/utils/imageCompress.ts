import { NativeModules } from 'react-native'

import { log } from '@/utils/log'

export interface CompressResult {
  /** 压缩后的图片路径；原生模块不可用或失败时为原图路径 */
  path: string
  width: number
  height: number
  size: number
}

interface CompressOptions {
  /** 长边上限，默认 500 */
  maxSize?: number
  /** JPEG 压缩质量，默认 85 */
  quality?: number
  /** 长边不超过 maxSize 且体积不超过该值时直接使用原图，默认 300KB */
  maxDirectBytes?: number
}

interface ImageCompressModuleType {
  compressImage: (
    srcPath: string,
    destPath: string,
    maxSize: number,
    quality: number,
    maxDirectBytes: number,
  ) => Promise<CompressResult>
}

const { ImageCompressModule } = NativeModules as { ImageCompressModule?: ImageCompressModuleType }

export const isImageCompressSupported = () => !!ImageCompressModule

/**
 * 压缩封面图（长边 maxSize、JPEG quality）
 * 原生模块不可用或压缩失败时回退原图，不抛出异常，避免阻断下载任务
 */
export const compressImage = async(
  srcPath: string,
  destPath: string,
  options: CompressOptions = {},
): Promise<CompressResult> => {
  const { maxSize = 500, quality = 85, maxDirectBytes = 307200 } = options
  if (!ImageCompressModule) {
    log.info('image compress module not found, use source image')
    return { path: srcPath, width: 0, height: 0, size: 0 }
  }
  try {
    const result = await ImageCompressModule.compressImage(srcPath, destPath, maxSize, quality, maxDirectBytes)
    return result?.path ? result : { path: srcPath, width: 0, height: 0, size: 0 }
  } catch (error) {
    log.error('compress image failed', error)
    return { path: srcPath, width: 0, height: 0, size: 0 }
  }
}
