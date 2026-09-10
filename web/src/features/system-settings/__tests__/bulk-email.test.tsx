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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { getCurrentBulkEmailTask } from '../api'
import { BulkEmailSection } from '../content/bulk-email-section'
import type { BulkEmailTask } from '../types'

vi.mock('../api', () => ({
  getCurrentBulkEmailTask: vi.fn(),
  previewBulkEmail: vi.fn(),
  startBulkEmail: vi.fn(),
}))

afterEach(() => vi.useRealTimers())

it.each(['pending', 'running'] as const)(
  'polls a %s task until completion and then stops',
  async (status) => {
    vi.useFakeTimers()
    const task: BulkEmailTask = {
      id: 1,
      task_id: 'test-bulk-email',
      type: 'bulk_email',
      status,
      created_at: 0,
      updated_at: 0,
      state: { total: 2, processed: 0, succeeded: 0, failed: 0, progress: 0 },
    }
    vi.mocked(getCurrentBulkEmailTask)
      .mockResolvedValueOnce({ success: true, message: '', data: task })
      .mockResolvedValue({
        success: true,
        message: '',
        data: {
          ...task,
          status: 'succeeded',
          result: { total: 2, succeeded: 2, failed: 0 },
        },
      })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    const view = render(
      <QueryClientProvider client={client}>
        <BulkEmailSection />
      </QueryClientProvider>
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByText('Current task')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send email' })).toBeDisabled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5001)
    })
    expect(
      screen.getByText('Last task: succeeded. Succeeded: 2, failed: 0.')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send email' })).toBeEnabled()
    const completedCalls = vi.mocked(getCurrentBulkEmailTask).mock.calls.length
    expect(completedCalls).toBe(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(getCurrentBulkEmailTask).toHaveBeenCalledTimes(completedCalls)
    view.unmount()
    client.clear()
  }
)
