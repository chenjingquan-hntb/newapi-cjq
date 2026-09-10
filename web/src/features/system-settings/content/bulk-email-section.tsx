/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Mail, RefreshCw, Send } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'

import {
  getCurrentBulkEmailTask,
  previewBulkEmail,
  startBulkEmail,
} from '../api'
import { SettingsSection } from '../components/settings-section'
import type { BulkEmailRequest } from '../types'

type BulkEmailSectionProps = Record<string, never>

const DEFAULT_RATE = 2
const POLL_INTERVAL_MS = 5000

export function BulkEmailSection(_: BulkEmailSectionProps) {
  const { t } = useTranslation()
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [group, setGroup] = useState('')
  const [includeDisabled, setIncludeDisabled] = useState(false)
  const [ratePerSecond, setRatePerSecond] = useState(DEFAULT_RATE)
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const queryClient = useQueryClient()
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const request = (): BulkEmailRequest => ({
    subject,
    content,
    group: group.trim() || undefined,
    include_disabled: includeDisabled,
    rate_per_second: ratePerSecond,
  })

  const { data: currentTask = null, refetch } = useQuery({
    queryKey: ['system-task', 'bulk-email'],
    queryFn: async () => {
      const response = await getCurrentBulkEmailTask()
      if (!response.success) {
        throw new Error(
          response.message || t('Failed to load the current task.')
        )
      }
      return response.data ?? null
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'pending' || status === 'running'
        ? POLL_INTERVAL_MS
        : false
    },
  })

  const handlePreview = async () => {
    setIsPreviewing(true)
    try {
      const response = await previewBulkEmail(request())
      if (!response.success) {
        throw new Error(response.message || t('Preview failed.'))
      }
      const count = response.data?.recipient_count ?? 0
      setRecipientCount(count)
      toast.success(t('Preview loaded.'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Preview failed.'))
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleStart = async () => {
    setIsStarting(true)
    try {
      const response = await startBulkEmail(request())
      if (!response.success || !response.data) {
        throw new Error(
          response.message || t('Failed to start the email task.')
        )
      }
      queryClient.setQueryData(['system-task', 'bulk-email'], response.data)
      setConfirmOpen(false)
      toast.success(t('Email task started.'))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to start the email task.')
      )
    } finally {
      setIsStarting(false)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refetch({ throwOnError: true })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to load the current task.')
      )
    } finally {
      setIsRefreshing(false)
    }
  }

  const state = currentTask?.state
  const isActive =
    currentTask !== null && ['pending', 'running'].includes(currentTask.status)
  const progress = Math.min(100, Math.max(0, state?.progress ?? 0))

  return (
    <SettingsSection title={t('Bulk email')}>
      <div className='space-y-4'>
        <Alert>
          <Mail />
          <AlertTitle>{t('Send email to users')}</AlertTitle>
          <AlertDescription>
            {t(
              'Messages are sent asynchronously through the configured SMTP server.'
            )}
          </AlertDescription>
        </Alert>

        <div className='grid gap-4 lg:grid-cols-2'>
          <label className='space-y-1.5'>
            <span className='text-sm font-medium'>{t('Subject')}</span>
            <Input
              value={subject}
              maxLength={200}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={t('Email subject')}
            />
          </label>

          <label className='space-y-1.5'>
            <span className='text-sm font-medium'>{t('Group')}</span>
            <Input
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              placeholder={t('Leave empty for all groups')}
            />
          </label>
        </div>

        <label className='block space-y-1.5'>
          <span className='text-sm font-medium'>{t('Email content')}</span>
          <Textarea
            value={content}
            rows={10}
            onChange={(event) => setContent(event.target.value)}
            placeholder={t('HTML email content')}
          />
          <span className='text-muted-foreground text-xs'>
            {t('HTML is supported. Empty email addresses are skipped.')}
          </span>
        </label>

        <div className='grid gap-4 lg:grid-cols-2'>
          <label className='space-y-1.5'>
            <span className='text-sm font-medium'>{t('Rate per second')}</span>
            <Input
              type='number'
              min={1}
              max={20}
              value={ratePerSecond}
              onChange={(event) =>
                setRatePerSecond(Number(event.target.value) || 0)
              }
            />
            <span className='text-muted-foreground text-xs'>
              {t('Allowed range: 1-20 emails per second.')}
            </span>
          </label>

          <div className='flex items-start gap-2 pt-7'>
            <Checkbox
              checked={includeDisabled}
              onCheckedChange={setIncludeDisabled}
              id='bulk-email-include-disabled'
            />
            <label
              htmlFor='bulk-email-include-disabled'
              className='space-y-0.5'
            >
              <span className='block text-sm font-medium'>
                {t('Include disabled users')}
              </span>
              <span className='text-muted-foreground block text-xs'>
                {t('Disabled users are excluded by default.')}
              </span>
            </label>
          </div>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={handlePreview}
            disabled={isPreviewing || isActive}
          >
            <Eye data-icon='inline-start' />
            {isPreviewing ? t('Loading...') : t('Preview recipients')}
          </Button>
          <Button
            type='button'
            onClick={() => setConfirmOpen(true)}
            disabled={isStarting || isActive || recipientCount === 0}
          >
            <Send data-icon='inline-start' />
            {t('Send email')}
          </Button>
          {recipientCount !== null && (
            <Badge variant='outline'>
              {t('Recipient count: {{count}}', { count: recipientCount })}
            </Badge>
          )}
        </div>

        {isActive && currentTask && state && (
          <div className='space-y-2 rounded-xl border p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                <span className='text-sm font-medium'>{t('Current task')}</span>
                <Badge variant='secondary'>{t(currentTask.status)}</Badge>
              </div>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw data-icon='inline-start' />
                {t('Refresh')}
              </Button>
            </div>
            <Progress value={progress} />
            <div className='text-muted-foreground flex flex-wrap justify-between gap-2 text-xs'>
              <span>
                {t('Processed {{processed}} of {{total}}', {
                  processed: state.processed,
                  total: state.total,
                })}
              </span>
              <span>{progress}%</span>
            </div>
          </div>
        )}

        {!isActive && currentTask && (
          <div className='text-muted-foreground rounded-xl border border-dashed p-4 text-sm'>
            {t(
              'Last task: {{status}}. Succeeded: {{succeeded}}, failed: {{failed}}.',
              {
                status: t(currentTask.status),
                succeeded:
                  currentTask.result?.succeeded ?? state?.succeeded ?? 0,
                failed: currentTask.result?.failed ?? state?.failed ?? 0,
              }
            )}
          </div>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Confirm bulk email')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This will send the message to {{count}} recipients. Continue?',
                {
                  count: recipientCount ?? 0,
                }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleStart} disabled={isStarting}>
              {isStarting ? t('Sending...') : t('Start sending')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
