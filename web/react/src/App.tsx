import AppBar from "@mui/material/AppBar"
import Chip from "@mui/material/Chip"
import Container from "@mui/material/Container"
import Tab from "@mui/material/Tab"
import Tabs from "@mui/material/Tabs"
import Toolbar from "@mui/material/Toolbar"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"

import { api, type Manifest } from "./api/client"
import { formatPercent } from "./lib/stats"
import { ClassifyPage } from "./pages/ClassifyPage"
import { MonitoringPage } from "./pages/MonitoringPage"

type Page = "classify" | "monitoring"

// The tab follows the URL hash, so it survives a reload and can be linked to
const pageFromHash = (): Page =>
  window.location.hash === "#monitoring" ? "monitoring" : "classify"

export function App() {
  const [page, setPage] = useState<Page>(pageFromHash)
  const [model, setModel] = useState<Manifest>()

  useEffect(() => {
    api.model().then(setModel, () => {})
    const onHashChange = () => setPage(pageFromHash())
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Endpoint classifier
          </Typography>
          {model && <ModelChip model={model} />}
        </Toolbar>
        <Tabs
          value={page}
          onChange={(_, value: Page) => {
            window.location.hash = value
          }}
          textColor="inherit"
          indicatorColor="secondary"
          sx={{ px: 2 }}
        >
          <Tab value="classify" label="Classify" />
          <Tab value="monitoring" label="Monitoring" />
        </Tabs>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        {page === "classify" ? <ClassifyPage /> : <MonitoringPage />}
      </Container>
    </>
  )
}

function ModelChip({ model }: { model: Manifest }) {
  const { classifier, evaluation, review_threshold } = model
  return (
    <Tooltip
      title={`Trained ${classifier.trained_on} · accuracy ${formatPercent(evaluation.accuracy, 1)} · review below ${review_threshold}`}
    >
      <Chip
        label={`model v${classifier.version}`}
        size="small"
        sx={{ color: "inherit", borderColor: "currentColor" }}
        variant="outlined"
      />
    </Tooltip>
  )
}
