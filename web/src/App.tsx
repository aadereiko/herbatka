import { HealthCard } from './features/health/HealthCard'

/** The standalone status page, kept at /health now that the signed-in home is the root.
 *  The card itself moved to features/health so the home page can show it too. */
export default function App() {
  return (
    <main className="page-ground grid min-h-dvh place-items-center p-6">
      <h1 className="sr-only">Herbatka status</h1>
      <HealthCard />
    </main>
  )
}
