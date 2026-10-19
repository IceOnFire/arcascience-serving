import Card from "@mui/material/Card"
import CardContent from "@mui/material/CardContent"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"

interface Props {
  title: string
  value: ReactNode
  caption?: ReactNode
}

export function StatCard({ title, value, caption }: Props) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h4" component="div">
          {value}
        </Typography>
        {caption && (
          <Typography variant="body2" color="text.secondary">
            {caption}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
