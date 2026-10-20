import { Typography } from "@inglorious/ui/typography"

import type { NotFoundType } from "../../types"

export const NotFound: NotFoundType = {
  render() {
    return Typography.render({ variant: "h2", children: "Not Found" })
  },
}
