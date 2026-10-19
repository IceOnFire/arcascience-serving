import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Chip from "@mui/material/Chip"
import LinearProgress from "@mui/material/LinearProgress"
import Paper from "@mui/material/Paper"
import Stack from "@mui/material/Stack"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { type FormEvent, useState } from "react"

import { api, MAX_TEXTS, type Prediction } from "../api/client"
import { formatPercent, parseTexts } from "../lib/stats"

// One confident prediction and one flagged for review, as in the API's README
const EXAMPLE = "Maximum plasma concentration (Cmax)\nNumber of participants"

interface Result {
  text: string
  prediction: Prediction
}

export function ClassifyPage() {
  const [input, setInput] = useState(EXAMPLE)
  const [results, setResults] = useState<Result[]>([])
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const texts = parseTexts(input)
  const tooMany = texts.length > MAX_TEXTS

  async function classify(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(undefined)
    try {
      const { predictions } = await api.predict(texts)
      setResults(texts.map((text, i) => ({ text, prediction: predictions[i] })))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const flagged = results.filter((r) => r.prediction.needs_review).length

  return (
    <Stack spacing={3}>
      <Box component="form" onSubmit={classify}>
        <Stack spacing={2}>
          <TextField
            label="Clinical trial endpoints, one per line"
            multiline
            minRows={4}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            error={tooMany}
            helperText={
              tooMany
                ? `At most ${MAX_TEXTS} endpoints per request`
                : `${texts.length} endpoint${texts.length === 1 ? "" : "s"}`
            }
          />
          <Box>
            <Button
              type="submit"
              variant="contained"
              disabled={loading || texts.length === 0 || tooMany}
            >
              Classify
            </Button>
          </Box>
        </Stack>
      </Box>

      {loading && <LinearProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {results.length > 0 && (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            {results.length} classified, {flagged} need
            {flagged === 1 ? "s" : ""} review
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Endpoint</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell sx={{ width: 200 }}>Confidence</TableCell>
                  <TableCell>Alternatives</TableCell>
                  <TableCell>Review</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map(({ text, prediction: p }, i) => (
                  <TableRow key={i}>
                    <TableCell>{text}</TableCell>
                    <TableCell>
                      <Chip label={p.category} size="small" />
                    </TableCell>
                    <TableCell>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "center" }}
                      >
                        <LinearProgress
                          variant="determinate"
                          value={p.confidence * 100}
                          color={p.needs_review ? "warning" : "success"}
                          sx={{ flexGrow: 1 }}
                        />
                        <Typography variant="body2">
                          {formatPercent(p.confidence)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {p.top
                          .slice(1)
                          .filter((t) => t.probability >= 0.01) // hide noise
                          .map(
                            (t) =>
                              `${t.category} ${formatPercent(t.probability)}`,
                          )
                          .join(", ")}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {p.needs_review ? (
                        <Chip
                          label="Needs review"
                          color="warning"
                          size="small"
                        />
                      ) : (
                        <Chip
                          label="OK"
                          color="success"
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      )}
    </Stack>
  )
}
