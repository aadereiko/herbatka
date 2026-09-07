import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import type { TeaSeries } from '../../lib/catalog'
import { TeaConsumptionPlot } from './TeaConsumptionPlot'

afterEach(cleanup)

function seriesOf(grams: number[]): TeaSeries {
  return {
    weeks: grams.map((g, i) => ({
      // Mondays, oldest first.
      week_start: `2026-06-${String(1 + i * 7).padStart(2, '0')}`,
      grams: g,
      brews: g > 0 ? Math.max(1, Math.round(g / 5)) : 0,
    })),
    total_grams: grams.reduce((a, b) => a + b, 0),
    total_brews: grams.filter((g) => g > 0).length,
  }
}

test('every week gets a mark, including the empty ones', () => {
  render(<TeaConsumptionPlot series={seriesOf([0, 12, 0, 24])} teaName="Sencha" />)

  // Four weeks in, four marks out. A plot that dropped the empty weeks would space the
  // survivors evenly and draw steady drinking out of two scattered cups.
  const table = screen.getByTestId('tea-plot-table')
  expect(within(table).getAllByRole('row')).toHaveLength(5) // header + 4
})

test('the numbers are readable without hovering, colour, or a pointer', () => {
  render(<TeaConsumptionPlot series={seriesOf([0, 12, 0, 24])} teaName="Sencha" />)

  // The plot itself is one role="img" with a summary rather than twelve tab stops; the
  // table is the accessible representation and carries every value.
  const plot = screen.getByRole('img')
  expect(plot).toHaveAccessibleName(/Weekly Sencha brewed/)
  expect(plot).toHaveAccessibleName(/36 g in total/)

  const table = screen.getByTestId('tea-plot-table')
  expect(table).toHaveTextContent('24 g')
  expect(table).toHaveTextContent('12 g')
})

test('the read-out shows the busiest week before anybody touches it', () => {
  render(<TeaConsumptionPlot series={seriesOf([4, 31, 8])} teaName="Sencha" />)

  // A chart whose value read-out is blank until hovered is a chart that says nothing on a
  // touch screen.
  expect(screen.getByTestId('tea-plot-readout')).toHaveTextContent('31 g')
})

test('one series carries no legend', () => {
  render(<TeaConsumptionPlot series={seriesOf([4, 8])} teaName="Sencha" />)

  // A legend box with a single swatch restates the heading above it and costs a line.
  expect(screen.queryByText(/^Sencha$/)).toBeNull()
})
