// @inglorious/charts 10.0.7 ships no type declarations. This covers what this app uses:
// composition mode (Chart.render with primitives as children).
declare module "@inglorious/charts" {
  import type { TemplateResult } from "@inglorious/web"

  export interface ChartPrimitive {
    type: string
    props: Record<string, unknown>
  }

  type PrimitiveFactory = (props?: Record<string, unknown>) => ChartPrimitive

  export interface ChartRenderProps {
    /** Id of the entity holding the chart's own state (its tooltip) */
    entity: string
    width?: number
    height?: number
    padding?: { top: number; right: number; bottom: number; left: number }
    data?: Record<string, unknown>[]
    children: ChartPrimitive[]
  }

  export const Chart: {
    render(props: ChartRenderProps, api: unknown): TemplateResult
    CartesianGrid: PrimitiveFactory
    XAxis: PrimitiveFactory
    YAxis: PrimitiveFactory
    Line: PrimitiveFactory
    Area: PrimitiveFactory
    Bar: PrimitiveFactory
    Pie: PrimitiveFactory
    Dots: PrimitiveFactory
    Tooltip: PrimitiveFactory
    Legend: PrimitiveFactory
    Brush: PrimitiveFactory
    // Plus the event handlers that make it a store type
    [handler: string]: unknown
  }
}
