// 修补依赖源码以使构建的依赖恢复正常工作

const fs = require('node:fs')
const path = require('node:path')

const rootPath = path.join(__dirname, './')
const trackPlayerMetadataPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/metadata/MetadataManager.java')
const trackPlayerMusicManagerPath = path.join(rootPath, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java')

const patchs = [
  [
    trackPlayerMetadataPath,
    '        session.setFlags(MediaSessionCompat.FLAG_HANDLES_QUEUE_COMMANDS);',
    '        session.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS | MediaSessionCompat.FLAG_HANDLES_QUEUE_COMMANDS);',
  ],
  [
    trackPlayerMetadataPath,
    '        session.setRatingType(ratingType);\n\n        updateNotification();',
    '        session.setRatingType(ratingType);\n        if (manager.getPlayback() != null) updatePlaybackState(manager.getPlayback());\n\n        updateNotification();',
  ],
  [
    trackPlayerMetadataPath,
    '    private void updatePlaybackState(ExoPlayback playback) {\n' +
    '        // Updates the media session state\n' +
    '        PlaybackStateCompat.Builder pb = new PlaybackStateCompat.Builder();\n' +
    '        pb.setActions(actions);\n' +
    '        pb.setState(playback.getState(), playback.getPosition(), playback.getRate());\n' +
    '        pb.setBufferedPosition(playback.getBufferedPosition());\n\n' +
    '        session.setPlaybackState(pb.build());\n' +
    '    }',
    '    public void updatePlaybackState(ExoPlayback playback) {\n' +
    '        if (playback == null) return;\n' +
    '        int state = playback.getState();\n' +
    '        // 有当前曲目或元数据在身时，避免切歌/报错停顿期间上报 STATE_NONE(0) 导致车机方控屏蔽下一首按键\n' +
    '        if (state == PlaybackStateCompat.STATE_NONE && (prevMetadata != null || !playback.getQueue().isEmpty())) {\n' +
    '            state = PlaybackStateCompat.STATE_PAUSED;\n' +
    '        }\n' +
    '        // Updates the media session state\n' +
    '        PlaybackStateCompat.Builder pb = new PlaybackStateCompat.Builder();\n' +
    '        pb.setActions(actions);\n' +
    '        pb.setState(state, playback.getPosition(), playback.getRate());\n' +
    '        pb.setBufferedPosition(playback.getBufferedPosition());\n\n' +
    '        session.setPlaybackState(pb.build());\n' +
    '    }',
  ],
  [
    trackPlayerMusicManagerPath,
    '        if (playback.shouldAutoUpdateMetadata()) handleUpdateMetadata();',
    '        if (playback.shouldAutoUpdateMetadata()) handleUpdateMetadata();\n' +
    '        else if (metadata.getSession().isActive()) metadata.updatePlaybackState(playback);',
  ],
]

;(async() => {
  for (const [filePath, fromStr, toStr] of patchs) {
    console.log(`Patching ${filePath.replace(rootPath, '')}`)
    try {
      const file = (await fs.promises.readFile(filePath, 'utf8')).replace(/\r\n/g, '\n')
      if (file.includes(toStr)) {
        console.log('  Already patched, skipping.')
        continue
      }
      if (!file.includes(fromStr)) {
        console.warn(`  Target snippet not found in ${filePath.replace(rootPath, '')}`)
        continue
      }
      await fs.promises.writeFile(filePath, file.replace(fromStr, toStr), 'utf8')
    } catch (err) {
      console.error(`Patch ${filePath.replace(rootPath, '')} failed: ${err.message}`)
    }
  }
  console.log('\nDependencies patch finished.\n')
})()
