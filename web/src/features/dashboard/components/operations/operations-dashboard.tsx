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
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  BadgeDollarSign,
  Banknote,
  Clock3,
  Percent,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  UserPlus,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts'

import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  formatLocalCurrencyAmount,
  formatQuotaWithCurrency,
} from '@/lib/currency'
import { cn } from '@/lib/utils'

import {
  getOperationsFinance,
  getOperationsQuotaRanking,
  getOperationsRegistrations,
  getOperationsSummary,
  getOperationsTopUps,
} from '../../api'
import type {
  OperationsQuotaRank,
  OperationsRegistrationPoint,
  OperationsTopUpPoint,
  OperationsTopUpRank,
} from '../../types'
import { PanelWrapper } from '../ui/panel-wrapper'
import { StatCard } from '../ui/stat-card'

type RankingKind = 'quota' | 'topup' | null

type TimeRange = {
  start_timestamp: number
  end_timestamp: number
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getTodayRanges(now: Date) {
  const todayStart = startOfLocalDay(now)
  const elapsed = now.getTime() - todayStart.getTime()
  const previousStart = new Date(todayStart)
  previousStart.setDate(previousStart.getDate() - 1)
  return {
    current: {
      start_timestamp: Math.floor(todayStart.getTime() / 1000),
      end_timestamp: Math.floor(now.getTime() / 1000) + 1,
    },
    previous: {
      start_timestamp: Math.floor(previousStart.getTime() / 1000),
      end_timestamp: Math.floor((previousStart.getTime() + elapsed) / 1000) + 1,
    },
  }
}

function getTrendRange(now: Date, days: number): TimeRange {
  const start = startOfLocalDay(now)
  start.setDate(start.getDate() - (days - 1))
  return {
    start_timestamp: Math.floor(start.getTime() / 1000),
    end_timestamp: Math.floor(now.getTime() / 1000) + 1,
  }
}

function fillDailyPoints<T extends { date: string }>(
  points: T[],
  days: number,
  now: Date,
  createEmpty: (date: string) => T
) {
  const byDate = new Map(points.map((point) => [point.date, point]))
  const start = startOfLocalDay(now)
  start.setDate(start.getDate() - (days - 1))
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = localDateKey(date)
    return byDate.get(key) ?? createEmpty(key)
  })
}

function formatChange(current: number, previous?: number) {
  if (previous == null) return null
  if (previous === 0) return current === 0 ? '0%' : '+100%'
  const change = ((current - previous) / Math.abs(previous)) * 100
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`
}

function RankingList(props: {
  kind: Exclude<RankingKind, null>
  quotaRanking: OperationsQuotaRank[]
  topUpRanking: OperationsTopUpRank[]
  loading: boolean
  error: boolean
}) {
  const { t } = useTranslation()
  const items = props.kind === 'quota' ? props.quotaRanking : props.topUpRanking

  if (props.loading) {
    return (
      <div className='text-muted-foreground p-5 text-sm'>{t('Loading')}</div>
    )
  }
  if (props.error) {
    return (
      <div className='text-muted-foreground flex min-h-48 items-center justify-center p-5 text-sm'>
        {t('Failed to load')}
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className='text-muted-foreground flex min-h-48 items-center justify-center p-5 text-sm'>
        {t('No data available')}
      </div>
    )
  }

  return (
    <div className='divide-y overflow-y-auto px-4 pb-5'>
      {items.map((item, index) => {
        const value =
          props.kind === 'quota'
            ? formatQuotaWithCurrency((item as OperationsQuotaRank).quota)
            : formatLocalCurrencyAmount((item as OperationsTopUpRank).amount)
        const count =
          props.kind === 'quota'
            ? (item as OperationsQuotaRank).count
            : (item as OperationsTopUpRank).order_count
        return (
          <div
            key={item.user_id}
            className='flex items-center justify-between gap-3 py-3'
          >
            <div className='flex min-w-0 items-center gap-3'>
              <span
                className={cn(
                  'bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  index < 3 && 'bg-primary/10 text-primary'
                )}
              >
                {index + 1}
              </span>
              <div className='min-w-0'>
                <div className='truncate font-medium'>
                  {item.username || `${t('User')} #${item.user_id}`}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {t('User ID')}: {item.user_id} · {count.toLocaleString()}{' '}
                  {props.kind === 'quota' ? t('Requests') : t('Orders')}
                </div>
              </div>
            </div>
            <div className='shrink-0 font-mono font-semibold tabular-nums'>
              {value}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function OperationsDashboard() {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => new Date())
  const [registrationDays, setRegistrationDays] = useState(7)
  const [topUpDays, setTopUpDays] = useState(7)
  const [rankingKind, setRankingKind] = useState<RankingKind>(null)

  const registrationChartConfig = useMemo<ChartConfig>(
    () => ({
      count: { label: t('New users'), color: 'var(--chart-2)' },
    }),
    [t]
  )
  const topUpChartConfig = useMemo<ChartConfig>(
    () => ({
      amount: { label: t('Recharge amount'), color: 'var(--chart-1)' },
    }),
    [t]
  )

  const todayRanges = useMemo(() => getTodayRanges(now), [now])
  const registrationRange = useMemo(
    () => getTrendRange(now, registrationDays),
    [now, registrationDays]
  )
  const topUpRange = useMemo(
    () => getTrendRange(now, topUpDays),
    [now, topUpDays]
  )

  const summaryQuery = useQuery({
    queryKey: ['operations-summary', todayRanges],
    queryFn: () =>
      getOperationsSummary({
        ...todayRanges.current,
        previous_start_timestamp: todayRanges.previous.start_timestamp,
        previous_end_timestamp: todayRanges.previous.end_timestamp,
      }),
    staleTime: 60_000,
  })
  const financeQuery = useQuery({
    queryKey: ['operations-finance', todayRanges.current],
    queryFn: () => getOperationsFinance(todayRanges.current),
    staleTime: 60_000,
  })
  const registrationsQuery = useQuery({
    queryKey: ['operations-registrations', registrationRange],
    queryFn: () => getOperationsRegistrations(registrationRange),
    staleTime: 60_000,
  })
  const topUpsQuery = useQuery({
    queryKey: ['operations-topups', topUpRange],
    queryFn: () => getOperationsTopUps(topUpRange),
    staleTime: 60_000,
  })
  const quotaRankingQuery = useQuery({
    queryKey: ['operations-quota-ranking', todayRanges.current],
    queryFn: () => getOperationsQuotaRanking(todayRanges.current),
    enabled: rankingKind === 'quota',
  })
  const todayTopUpRankingQuery = useQuery({
    queryKey: ['operations-topup-ranking', todayRanges.current],
    queryFn: () => getOperationsTopUps(todayRanges.current),
    enabled: rankingKind === 'topup',
  })

  const registrationPoints = useMemo(
    () =>
      fillDailyPoints<OperationsRegistrationPoint>(
        registrationsQuery.data?.data ?? [],
        registrationDays,
        now,
        (date) => ({ date, count: 0 })
      ),
    [now, registrationDays, registrationsQuery.data?.data]
  )
  const topUpPoints = useMemo(
    () =>
      fillDailyPoints<OperationsTopUpPoint>(
        topUpsQuery.data?.data.points ?? [],
        topUpDays,
        now,
        (date) => ({ date, amount: 0, order_count: 0, payer_count: 0 })
      ),
    [now, topUpDays, topUpsQuery.data?.data.points]
  )

  const summary = summaryQuery.data?.data
  const finance = financeQuery.data?.data
  const registrationTotal = registrationPoints.reduce(
    (total, point) => total + point.count,
    0
  )
  const topUpTotal = topUpPoints.reduce(
    (total, point) => total + point.amount,
    0
  )
  const previous = summary?.previous
  const refreshedAt = summary?.updated_at
    ? new Date(summary.updated_at * 1000).toLocaleTimeString()
    : '--'

  const refresh = () => {
    setNow(new Date())
    void summaryQuery.refetch()
    void financeQuery.refetch()
    void registrationsQuery.refetch()
    void topUpsQuery.refetch()
  }

  return (
    <div className='space-y-4'>
      <div className='bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-xs sm:px-5'>
        <div className='flex min-w-0 items-center gap-3'>
          <div className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl'>
            <TrendingUp className='size-4' aria-hidden='true' />
          </div>
          <div className='min-w-0'>
            <div className='font-medium'>{t('Today 00:00–now')}</div>
            <div className='text-muted-foreground flex flex-wrap gap-x-3 text-xs'>
              <span>{t('Updated at {{time}}', { time: refreshedAt })}</span>
              <span>
                {summary?.quota.export_enabled === false
                  ? t('Quota dashboard export is disabled')
                  : t('Quota data updates every {{minutes}} minutes', {
                      minutes: summary?.quota.export_interval_minutes ?? 5,
                    })}
              </span>
            </div>
          </div>
        </div>
        <Button variant='outline' size='sm' onClick={refresh}>
          <RefreshCw
            className={cn(
              'size-3.5',
              (summaryQuery.isFetching || topUpsQuery.isFetching) &&
                'animate-spin'
            )}
          />
          {t('Refresh')}
        </Button>
      </div>

      <div className='bg-card overflow-hidden rounded-2xl border p-3 shadow-xs sm:p-5'>
        <div className='mb-3 flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h3 className='text-sm font-semibold sm:text-base'>
              {t('Promotion snapshot')}
            </h3>
            <p className='text-muted-foreground text-xs sm:text-sm'>
              {t('Compare today with the same elapsed time yesterday')}
            </p>
          </div>
        </div>
        <div className='grid grid-cols-2 gap-2 lg:grid-cols-4'>
          <div className='bg-background/60 rounded-xl border p-3'>
            <StatCard
              title={t('Today’s quota consumption')}
              value={formatQuotaWithCurrency(summary?.quota.total)}
              description={t('Quota consumption, not cash revenue')}
              icon={Activity}
              tone='accent-1'
              loading={summaryQuery.isLoading}
              error={summaryQuery.isError}
              action={
                <Button
                  variant='ghost'
                  size='xs'
                  onClick={() => setRankingKind('quota')}
                >
                  {t('View ranking')}
                </Button>
              }
              details={[
                {
                  label: t('Vs. yesterday'),
                  value:
                    formatChange(summary?.quota.total ?? 0, previous?.quota) ??
                    '--',
                  tone:
                    (summary?.quota.total ?? 0) >= (previous?.quota ?? 0)
                      ? 'success'
                      : 'destructive',
                },
              ]}
            />
          </div>
          <div className='bg-background/60 rounded-xl border p-3'>
            <StatCard
              title={t('Today’s new users')}
              value={(summary?.new_users.count ?? 0).toLocaleString()}
              description={t('New registrations since local midnight')}
              icon={UserPlus}
              tone='accent-2'
              loading={summaryQuery.isLoading}
              error={summaryQuery.isError}
              details={[
                {
                  label: t('Vs. yesterday'),
                  value:
                    formatChange(
                      summary?.new_users.count ?? 0,
                      previous?.new_users
                    ) ?? '--',
                  tone:
                    (summary?.new_users.count ?? 0) >=
                    (previous?.new_users ?? 0)
                      ? 'success'
                      : 'destructive',
                },
              ]}
            />
          </div>
          <div className='bg-background/60 rounded-xl border p-3'>
            <StatCard
              title={t('Successful recharge today')}
              value={formatLocalCurrencyAmount(summary?.topups.amount)}
              description={t('Successful payments by completion time')}
              icon={BadgeDollarSign}
              tone='accent-3'
              loading={summaryQuery.isLoading}
              error={summaryQuery.isError}
              action={
                <Button
                  variant='ghost'
                  size='xs'
                  onClick={() => setRankingKind('topup')}
                >
                  {t('View ranking')}
                </Button>
              }
              details={[
                {
                  label: t('Vs. yesterday'),
                  value:
                    formatChange(
                      summary?.topups.amount ?? 0,
                      previous?.topup_amount
                    ) ?? '--',
                  tone:
                    (summary?.topups.amount ?? 0) >=
                    (previous?.topup_amount ?? 0)
                      ? 'success'
                      : 'destructive',
                },
              ]}
            />
          </div>
          <div className='bg-background/60 rounded-xl border p-3'>
            <StatCard
              title={t('Payers and orders')}
              value={`${(summary?.topups.payer_count ?? 0).toLocaleString()} / ${(summary?.topups.order_count ?? 0).toLocaleString()}`}
              description={`${t('Payers')} / ${t('Orders')}`}
              icon={ReceiptText}
              tone='accent-1'
              loading={summaryQuery.isLoading}
              error={summaryQuery.isError}
              details={[
                {
                  label: t('Average per payer'),
                  value: summary?.topups.payer_count
                    ? formatLocalCurrencyAmount(
                        summary.topups.amount / summary.topups.payer_count
                      )
                    : '--',
                },
              ]}
            />
          </div>
        </div>
      </div>

      <div className='grid gap-4 xl:grid-cols-[1.25fr_0.75fr]'>
        <PanelWrapper
          title={t('New user trend')}
          description={t('{{days}}-day total: {{count}} new users', {
            days: registrationDays,
            count: registrationTotal.toLocaleString(),
          })}
          loading={registrationsQuery.isLoading}
          empty={registrationsQuery.isError}
          emptyMessage={t('Failed to load')}
          headerActions={
            <Tabs
              value={String(registrationDays)}
              onValueChange={(value) => setRegistrationDays(Number(value))}
            >
              <TabsList>
                <TabsTrigger value='7'>{t('7 days')}</TabsTrigger>
                <TabsTrigger value='30'>{t('30 days')}</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          <ChartContainer
            config={registrationChartConfig}
            className='aspect-auto h-72 w-full'
          >
            <AreaChart data={registrationPoints} accessibilityLayer>
              <defs>
                <linearGradient
                  id='registration-fill'
                  x1='0'
                  y1='0'
                  x2='0'
                  y2='1'
                >
                  <stop
                    offset='5%'
                    stopColor='var(--color-count)'
                    stopOpacity={0.35}
                  />
                  <stop
                    offset='95%'
                    stopColor='var(--color-count)'
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey='date'
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tickFormatter={(value) => String(value).slice(5)}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => String(label)}
                    formatter={(value) => (
                      <div className='flex min-w-36 items-center justify-between gap-4'>
                        <span className='text-muted-foreground'>
                          {t('New users')}
                        </span>
                        <span className='font-mono font-semibold'>
                          {Number(value).toLocaleString()}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Area
                type='monotone'
                dataKey='count'
                stroke='var(--color-count)'
                fill='url(#registration-fill)'
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </PanelWrapper>

        <PanelWrapper
          title={t('Financial overview')}
          description={t(
            'Profit data is reserved for upstream cost integration'
          )}
          loading={financeQuery.isLoading}
          empty={financeQuery.isError}
          emptyMessage={t('Failed to load')}
          contentClassName='h-[18rem]'
        >
          <div className='grid h-full grid-cols-2 gap-3'>
            <div className='bg-background/60 flex flex-col justify-between rounded-xl border p-4'>
              <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
                <Banknote className='text-chart-1 size-4' />
                {t('Recharge revenue')}
              </div>
              <div className='font-mono text-xl font-semibold tabular-nums'>
                {formatLocalCurrencyAmount(finance?.revenue)}
              </div>
              <span className='text-muted-foreground text-xs'>
                {t('Successful recharge today')}
              </span>
            </div>
            <div className='bg-background/60 flex flex-col justify-between rounded-xl border p-4'>
              <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
                <TrendingUp className='text-chart-2 size-4' />
                {t('Net profit')}
              </div>
              <div className='font-mono text-xl font-semibold tabular-nums'>
                {finance?.net_profit == null
                  ? '--'
                  : formatLocalCurrencyAmount(finance.net_profit)}
              </div>
              <span className='text-warning text-xs'>
                {t('Awaiting upstream cost integration')}
              </span>
            </div>
            <div className='bg-background/60 flex flex-col justify-between rounded-xl border p-4'>
              <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
                <Percent className='text-chart-3 size-4' />
                {t('Profit margin')}
              </div>
              <div className='font-mono text-xl font-semibold tabular-nums'>
                {finance?.profit_margin == null
                  ? '--'
                  : `${(finance.profit_margin * 100).toFixed(1)}%`}
              </div>
              <span className='text-muted-foreground text-xs'>
                {t('Net profit divided by revenue')}
              </span>
            </div>
            <div className='bg-background/60 flex flex-col justify-between rounded-xl border p-4'>
              <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
                <Clock3 className='text-chart-4 size-4' />
                {t('Upstream cost')}
              </div>
              <div className='font-mono text-xl font-semibold tabular-nums'>
                {finance?.upstream_cost == null
                  ? '--'
                  : formatLocalCurrencyAmount(finance.upstream_cost)}
              </div>
              <span className='text-muted-foreground text-xs'>
                {t('Reserved data endpoint')}
              </span>
            </div>
          </div>
        </PanelWrapper>
      </div>

      <PanelWrapper
        title={t('Recharge trend')}
        description={t('{{days}}-day total: {{amount}}', {
          days: topUpDays,
          amount: formatLocalCurrencyAmount(topUpTotal),
        })}
        loading={topUpsQuery.isLoading}
        empty={topUpsQuery.isError}
        emptyMessage={t('Failed to load')}
        headerActions={
          <Tabs
            value={String(topUpDays)}
            onValueChange={(value) => setTopUpDays(Number(value))}
          >
            <TabsList>
              <TabsTrigger value='7'>{t('7 days')}</TabsTrigger>
              <TabsTrigger value='30'>{t('30 days')}</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        <ChartContainer
          config={topUpChartConfig}
          className='aspect-auto h-80 w-full'
        >
          <LineChart data={topUpPoints} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey='date'
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tickFormatter={(value) => String(value).slice(5)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(value) => Number(value).toLocaleString()}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => String(label)}
                  formatter={(value, _name, item) => {
                    const point = item.payload as OperationsTopUpPoint
                    return (
                      <div className='grid min-w-48 grid-cols-[1fr_auto] gap-x-4 gap-y-1'>
                        <span className='text-muted-foreground'>
                          {t('Recharge amount')}
                        </span>
                        <span className='font-mono font-semibold'>
                          {formatLocalCurrencyAmount(Number(value))}
                        </span>
                        <span className='text-muted-foreground'>
                          {t('Orders')}
                        </span>
                        <span className='font-mono'>
                          {point.order_count.toLocaleString()}
                        </span>
                        <span className='text-muted-foreground'>
                          {t('Payers')}
                        </span>
                        <span className='font-mono'>
                          {point.payer_count.toLocaleString()}
                        </span>
                      </div>
                    )
                  }}
                />
              }
            />
            <Line
              type='monotone'
              dataKey='amount'
              stroke='var(--color-amount)'
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ChartContainer>
      </PanelWrapper>

      <Sheet
        open={rankingKind != null}
        onOpenChange={(open) => !open && setRankingKind(null)}
      >
        <SheetContent className='w-full sm:max-w-xl'>
          <SheetHeader className='border-b pr-12'>
            <SheetTitle>
              {rankingKind === 'quota'
                ? t('Top consuming users')
                : t('Top paying users')}
            </SheetTitle>
            <SheetDescription>{t('Today 00:00–now')}</SheetDescription>
          </SheetHeader>
          {rankingKind != null && (
            <RankingList
              kind={rankingKind}
              quotaRanking={quotaRankingQuery.data?.data ?? []}
              topUpRanking={todayTopUpRankingQuery.data?.data.ranking ?? []}
              loading={
                quotaRankingQuery.isLoading || todayTopUpRankingQuery.isLoading
              }
              error={
                quotaRankingQuery.isError || todayTopUpRankingQuery.isError
              }
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
