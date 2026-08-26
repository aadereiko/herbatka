import { Link } from 'react-router'

import { ErrorNote, PageHeading, PageShell, Panel, Skeleton } from '../../components/ui/page'
import { describeApiError } from '../../lib/api'
import { useAuth } from '../auth/auth-context'
import { pluralise } from '../catalog/format'
import { useAdminTeaList } from './queries'

function AdminLink({
  to,
  title,
  children,
}: {
  to: string
  title: string
  children: string
}) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-brand-200 bg-white p-4 shadow-sm transition hover:border-brand-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <p className="text-base font-semibold text-brand-900 dark:text-brand-100">{title}</p>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{children}</p>
    </Link>
  )
}

export function AdminHomePage() {
  const { user } = useAuth()
  // Size 1: this card wants the envelope's `total`, not the teas themselves, and asking
  // for 24 rows to render a number is rude to the database.
  const pending = useAdminTeaList({ approved: false, page: 1, size: 1 })

  return (
    <PageShell>
      <PageHeading
        title="Admin"
        subtitle={`Signed in as ${user?.display_name ?? 'an administrator'}.`}
      />

      <Panel className="mb-6" ariaLabel="Pending approvals">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Waiting for review</p>
        {pending.isPending ? (
          <Skeleton className="mt-2 h-9 w-24" />
        ) : pending.isError ? (
          <div className="mt-2">
            <ErrorNote testId="pending-count-error">{describeApiError(pending.error)}</ErrorNote>
          </div>
        ) : (
          <p
            data-testid="pending-count"
            className="mt-1 text-3xl font-semibold text-brand-900 dark:text-brand-100"
          >
            {pluralise(pending.data?.total ?? 0, 'tea')}
          </p>
        )}
        <Link
          to="/admin/teas"
          className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Open the queue →
        </Link>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <AdminLink to="/admin/teas" title="Teas">
          Approve or remove submissions, and add a tea straight to the catalog.
        </AdminLink>
        <AdminLink to="/admin/ingredients" title="Ingredients">
          Keep the shared vocabulary tidy: add, rename and retire ingredients.
        </AdminLink>
        <AdminLink to="/teas" title="Browse the catalog">
          See what a signed-out visitor sees.
        </AdminLink>
        <AdminLink to="/ingredients" title="Browse ingredients">
          The public vocabulary list.
        </AdminLink>
      </div>
    </PageShell>
  )
}
