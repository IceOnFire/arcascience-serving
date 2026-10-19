import CssBaseline from "@mui/material/CssBaseline"
import { createTheme, ThemeProvider } from "@mui/material/styles"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./App"

// Material defaults, light or dark following the system. With CSS variables, the
// scheme comes from a CSS media query: no flash of the light theme on a dark system.
const theme = createTheme({
  cssVariables: true,
  colorSchemes: { light: true, dark: true },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
