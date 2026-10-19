import { Card } from "@inglorious/ui/card"
import { Typography } from "@inglorious/ui/typography"
import { html, type TemplateResult } from "@inglorious/web"

export interface StatCardProps {
  title: string
  value: TemplateResult | string | number
  caption?: string
}

export function render({ title, value, caption }: StatCardProps) {
  return Card.render({
    body: html`
      ${Typography.render({ variant: "overline", children: title })}
      <div class="stat-card-value">${value}</div>
      ${caption
        ? Typography.render({ variant: "caption", children: caption })
        : ""}
    `,
  })
}
