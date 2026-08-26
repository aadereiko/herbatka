import { Link } from 'react-router'

/** What RequireAdmin shows a signed-in non-admin. Deliberately not a redirect: bouncing
 *  someone silently reads as a broken link, while 403 says "you are in the right place,
 *  you just may not be here". */
export function ForbiddenPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-brand-50 p-6 dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-2xl border border-brand-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">403</p>
        <h1
          data-testid="forbidden-page"
          className="mt-1 text-xl font-semibold text-brand-900 dark:text-brand-100"
        >
          Not your teapot
        </h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          This page is for administrators.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Back to your shelf
        </Link>
      </div>
    </main>
  )
}
