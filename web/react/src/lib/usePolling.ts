import { useEffect, useState } from "react"

interface Polled<T> {
  data?: T
  error?: Error
  updatedAt?: Date
}

/** Calls `load` now and then every `intervalMs`, keeping the last result and the last error. */
export function usePolling<T>(
  load: () => Promise<T>,
  intervalMs: number,
): Polled<T> {
  const [state, setState] = useState<Polled<T>>({})

  useEffect(() => {
    let active = true
    const tick = () =>
      load().then(
        (data) => active && setState({ data, updatedAt: new Date() }),
        // Keep showing the last data when a refresh fails
        (error: Error) => active && setState((s) => ({ ...s, error })),
      )
    tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [load, intervalMs])

  return state
}
