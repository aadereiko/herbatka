import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { getHealth } from '../../lib/api'
import { TeaSprigMark } from '../../components/ui/botanical'

function StatusDot({ state }: { state: 'ok' | 'bad' | 'pending' }) {
  const colour =
    state === 'ok' ? 'bg-emerald-500' : state === 'bad' ? 'bg-rose-500' : 'bg-amber-400'
  return (
    <span className="relative flex size-3">
      {state === 'ok' && (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      <span className={`relative inline-flex size-3 rounded-full ${colour}`} />
    </span>
  )
}

/** Each value carries a testId: three rows can legitimately read "ok" at once, so
 *  tests need to address a specific one rather than the first match in the document. */
function Row({
  label,
  testId,
  children,
}: {
  label: string
  testId: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-neutral-600 dark:text-neutral-400">{label}</dt>
      <dd
        data-testid={testId}
        className="flex items-center gap-2 font-medium text-neutral-900 dark:text-neutral-100"
      >
        {children}
      </dd>
    </div>
  )
}

/** The M0 walking-skeleton card. It is no longer the whole app, so it renders as a
 *  section that any page can drop in — /health still shows it on its own. */
export function HealthCard() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  })

  const state = isPending ? 'pending' : isError || data?.status !== 'ok' ? 'bad' : 'ok'

  return (
    <section className="w-full max-w-md rounded-2xl border border-brand-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="wood-frame grid size-12 shrink-0 place-items-center rounded-md"
        >
          <TeaSprigMark className="size-8 text-brand-100" />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-brand-900 dark:text-brand-100">Herbatka</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Walking skeleton</p>
        </div>
      </div>

      <dl className="mt-6 space-y-3 text-sm">
        <Row label="API" testId="status-api">
          <StatusDot state={state} />
          {isPending ? 'checking…' : isError ? 'unreachable' : (data?.status ?? 'unknown')}
        </Row>
        <Row label="Database" testId="status-database">
          {data?.database ?? '—'}
        </Row>
        <Row label="Version" testId="status-version">
          <span className="font-mono">{data?.version ?? '—'}</span>
        </Row>
      </dl>

      {isError && (
        <p className="mt-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {(error as Error).message}
        </p>
      )}
    </section>
  )
}
