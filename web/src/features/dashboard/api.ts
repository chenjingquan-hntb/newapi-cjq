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
import { api } from '@/lib/api'

import type {
  FlowQuotaDataItem,
  QuotaDataItem,
  UptimeGroupResult,
  OperationsFinance,
  OperationsQuotaRank,
  OperationsRegistrationPoint,
  OperationsSummary,
  OperationsTopUpPoint,
  OperationsTopUpRank,
} from './types'

// ============================================================================
// Dashboard APIs
// ============================================================================

// ----------------------------------------------------------------------------
// Quota & Usage Data
// ----------------------------------------------------------------------------

// Get user quota data within a time range
// Admin users get all users' data by default.
export async function getUserQuotaDates(
  params: {
    start_timestamp: number
    end_timestamp: number
    default_time?: string
    username?: string
  },
  isAdmin = false
) {
  const endpoint = isAdmin ? '/api/data' : '/api/data/self'
  const res = await api.get<{ success: boolean; data: QuotaDataItem[] }>(
    endpoint,
    { params }
  )
  return res.data
}

// ----------------------------------------------------------------------------
// System Monitoring
// ----------------------------------------------------------------------------

export async function getUserQuotaDataByUsers(params: {
  start_timestamp: number
  end_timestamp: number
}) {
  const res = await api.get<{ success: boolean; data: QuotaDataItem[] }>(
    '/api/data/users',
    { params }
  )
  return res.data
}

export async function getFlowQuotaDates(
  params: {
    start_timestamp: number
    end_timestamp: number
    default_time?: string
    username?: string
  },
  isAdmin = false
) {
  const endpoint = isAdmin ? '/api/data/flow' : '/api/data/flow/self'
  const res = await api.get<{
    success: boolean
    data?: FlowQuotaDataItem[]
    message?: string
  }>(endpoint, { params })
  return res.data
}

// Get uptime monitoring status for all services
export async function getUptimeStatus() {
  const res = await api.get<{ success: boolean; data: UptimeGroupResult[] }>(
    '/api/uptime/status'
  )
  return res.data
}

type OperationsRange = {
  start_timestamp: number
  end_timestamp: number
}

export async function getOperationsSummary(
  params: OperationsRange &
    Partial<{
      previous_start_timestamp: number
      previous_end_timestamp: number
    }>
) {
  const res = await api.get<{ success: boolean; data: OperationsSummary }>(
    '/api/dashboard/operations/summary',
    { params }
  )
  return res.data
}

export async function getOperationsRegistrations(params: OperationsRange) {
  const res = await api.get<{
    success: boolean
    data: OperationsRegistrationPoint[]
  }>('/api/dashboard/operations/registrations', { params })
  return res.data
}

export async function getOperationsTopUps(params: OperationsRange) {
  const res = await api.get<{
    success: boolean
    data: { points: OperationsTopUpPoint[]; ranking: OperationsTopUpRank[] }
  }>('/api/dashboard/operations/topups', { params })
  return res.data
}

export async function getOperationsQuotaRanking(params: OperationsRange) {
  const res = await api.get<{
    success: boolean
    data: OperationsQuotaRank[]
  }>('/api/dashboard/operations/quota-ranking', { params })
  return res.data
}

export async function getOperationsFinance(params: OperationsRange) {
  const res = await api.get<{ success: boolean; data: OperationsFinance }>(
    '/api/dashboard/operations/finance',
    { params }
  )
  return res.data
}
