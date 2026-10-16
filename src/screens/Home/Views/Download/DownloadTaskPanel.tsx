import { memo, useCallback, useMemo, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'

import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { cancelAll, cancelTask, clearCompleted, retryTask } from '@/core/download'
import { useDownloadTasks } from '@/store/downloadTask/hook'
import { confirmDialog, createStyle } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'

/** 折叠时最多显示的任务行数 */
const MAX_VISIBLE = 5

/**
 * 下载任务面板（「我的下载」顶部）
 * - 实时订阅队列：等待中 / 下载中（进度 + 速度） / 下载失败（可重试）
 * - 已完成任务只计数，可一键清除
 */
export default memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const tasks = useDownloadTasks()
  const [expanded, setExpanded] = useState(true)

  const completedCount = useMemo(() => tasks.filter(task => task.status == 'completed').length, [tasks])
  const visibleTasks = useMemo(() => tasks.slice(0, MAX_VISIBLE), [tasks])

  const handleCancelAll = useCallback(async() => {
    const confirm = await confirmDialog({
      message: t('download_task_cancel_all'),
      confirmButtonText: t('confirm_button_text'),
      cancelButtonText: t('list_import_part_button_cancel'),
    })
    if (!confirm) return
    cancelAll()
  }, [t])

  const renderTask = (task: LX.Download.ListItem) => {
    const isFailed = task.status == 'error'
    const isRunning = task.status == 'run'
    return (
      <View key={task.id} style={styles.taskRow}>
        <View style={styles.taskInfo}>
          <Text size={12} color={theme['c-font']} numberOfLines={1}>
            {task.metadata.musicInfo.name}
          </Text>
          <View style={styles.taskMeta}>
            <Text
              style={styles.taskStatus}
              size={10}
              color={isFailed ? theme['c-primary-font'] : theme['c-font-label']}
              numberOfLines={1}
            >
              {isFailed ? t('download_task_status_failed') : task.statusText}
            </Text>
            {isRunning && task.speed ? (
              <Text size={10} color={theme['c-350']} numberOfLines={1}>
                {task.speed}
              </Text>
            ) : null}
          </View>
          {isRunning ? (
            <View style={[styles.progressTrack, { backgroundColor: theme['c-border-background'] }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(0, Math.min(100, task.progress))}%`,
                    backgroundColor: theme['c-primary-font'],
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
        {isFailed ? (
          <TouchableOpacity style={styles.retryBtn} onPress={() => { retryTask(task.id) }}>
            <Text size={12} color={theme['c-primary-font']}>
              {t('download_task_retry')}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.cancelBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => { cancelTask(task.id) }}
        >
          <Icon name="close" size={13} color={theme['c-350']} />
        </TouchableOpacity>
      </View>
    )
  }

  if (!tasks.length) return null

  return (
    <View style={[styles.container, { borderBottomColor: theme['c-border-background'] }]}>
      <TouchableOpacity
        style={styles.header}
        activeOpacity={0.7}
        onPress={() => { setExpanded(value => !value) }}
      >
        <Icon name="download-2" size={14} color={theme['c-primary-font']} style={styles.headerIcon} />
        <Text size={12} color={theme['c-font']}>
          {t('download_task_title')}
        </Text>
        <Text style={styles.headerCount} size={11} color={theme['c-font-label']}>
          {`${completedCount}/${tasks.length}`}
        </Text>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme['c-350']} />
      </TouchableOpacity>
      {expanded ? (
        <>
          <View style={styles.taskList}>{visibleTasks.map(renderTask)}</View>
          <View style={styles.footer}>
            {tasks.length > MAX_VISIBLE ? (
              <Text size={10} color={theme['c-font-label']}>
                {`+${tasks.length - MAX_VISIBLE}`}
              </Text>
            ) : null}
            <View style={styles.footerSpace} />
            {completedCount ? (
              <Button style={styles.footerBtn} onPress={clearCompleted}>
                <Text size={12} color={theme['c-button-font']}>
                  {t('download_task_clear_completed')}
                </Text>
              </Button>
            ) : null}
            <Button style={styles.footerBtn} onPress={() => { void handleCancelAll() }}>
              <Text size={12} color={theme['c-button-font']}>
                {t('download_task_cancel_all')}
              </Text>
            </Button>
          </View>
        </>
      ) : null}
    </View>
  )
})

const styles = createStyle({
  container: {
    borderBottomWidth: BorderWidths.normal,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSizeW(12),
    height: scaleSizeH(34),
  },
  headerIcon: {
    marginRight: scaleSizeW(6),
  },
  headerCount: {
    flex: 1,
    marginLeft: scaleSizeW(8),
  },
  taskList: {
    paddingBottom: scaleSizeH(4),
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSizeW(12),
    paddingVertical: scaleSizeH(4),
  },
  taskInfo: {
    flex: 1,
    paddingRight: scaleSizeW(8),
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  taskStatus: {
    flex: 1,
    marginRight: scaleSizeW(6),
  },
  progressTrack: {
    height: scaleSizeH(2),
    borderRadius: 1,
    marginTop: scaleSizeH(4),
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  retryBtn: {
    paddingHorizontal: scaleSizeW(8),
    height: scaleSizeH(28),
    justifyContent: 'center',
  },
  cancelBtn: {
    width: scaleSizeW(24),
    height: scaleSizeH(28),
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSizeW(12),
    paddingBottom: scaleSizeH(6),
  },
  footerSpace: {
    flex: 1,
  },
  footerBtn: {
    paddingHorizontal: scaleSizeW(10),
    height: scaleSizeH(28),
    borderRadius: 4,
    marginLeft: scaleSizeW(8),
  },
})
