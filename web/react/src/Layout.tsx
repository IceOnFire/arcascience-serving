import AppBar from "@mui/material/AppBar"
import Chip from "@mui/material/Chip"
import Container from "@mui/material/Container"
import Tab from "@mui/material/Tab"
import Tabs from "@mui/material/Tabs"
import Toolbar from "@mui/material/Toolbar"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import {
  createLink,
  getRouteApi,
  Outlet,
  useLocation,
} from "@tanstack/react-router"

import type { Manifest } from "./api/client"
import { formatPercent } from "./lib/stats"

// A Material UI tab that navigates like a router link
const TabLink = createLink(Tab)

const root = getRouteApi("__root__")
const TABS = ["/", "/monitoring"]

export function Layout() {
  const model = root.useLoaderData()
  const pathname = useLocation({ select: (location) => location.pathname })

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
          // false: no tab selected, on a page that isn't one of them (Not Found)
          value={TABS.includes(pathname) ? pathname : false}
          textColor="inherit"
          indicatorColor="secondary"
          sx={{ px: 2 }}
        >
          <TabLink value="/" to="/" label="Classify" />
          <TabLink value="/monitoring" to="/monitoring" label="Monitoring" />
        </Tabs>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Outlet />
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
