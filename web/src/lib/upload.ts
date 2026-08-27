import { ApiError, api, describeApiError } from './api'
import type { UploadedImage } from './shop'

/**
 * Image uploads: the rules, the check, and the one call.
 *
 * The rules are duplicated from the server on purpose. The server is the authority and
 * still enforces both — this copy exists so that choosing a 40 MB photo on a phone tether
 * fails in a millisecond instead of after forty seconds of upload, and so the sentence
 * the user reads names the actual problem rather than "413".
 *
 * They are constants rather than an enum: `erasableSyntaxOnly` bans any TypeScript that
 * emits runtime code.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]

/** Human-readable, because "5242880 bytes" is not a limit anybody can hold in their
 *  head while looking at a file picker. */
export const MAX_IMAGE_LABEL = '5 MB'

const TYPE_LABEL = 'JPEG, PNG or WebP'

function isAllowedType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)
}

/**
 * Why this file cannot be uploaded, or null when it can.
 *
 * Type first: a 40 MB `.mov` is refused for being a video, which is the fact worth
 * telling somebody, rather than for being large — which would send them off to compress
 * it and try again with a file that was never going to work.
 *
 * A browser that reports an empty `type` (an extensionless file, some Android pickers)
 * is refused rather than waved through. The server would refuse it anyway, and guessing
 * from the filename is how a renamed `.exe` gets sent.
 */
export function describeRejectedFile(file: File): string | null {
  if (!isAllowedType(file.type)) {
    return `That is not an image we can use. Pick a ${TYPE_LABEL} file.`
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `That image is too large. The limit is ${MAX_IMAGE_LABEL}.`
  }
  return null
}

/**
 * `POST /uploads/image`, multipart, field name `file`.
 *
 * Goes through `api()` rather than around it, so the bearer header, the one silent
 * refresh on a 401 and the `detail`-reading error path all still apply. `api`'s `send`
 * notices the `FormData` body and omits the JSON Content-Type so the browser can write
 * its own boundary — see the note there.
 */
export async function uploadImage(file: File): Promise<UploadedImage> {
  const form = new FormData()
  form.append('file', file)
  return api<UploadedImage>('/uploads/image', { method: 'POST', body: form })
}

/**
 * What to show when the *server* refused the upload.
 *
 * 413 and 415 are the two the client already checked for, so reaching one means the
 * check and the server disagree — a file the browser typed as `image/png` that is not
 * one, or a limit that has been tightened since this bundle was built. Both get our
 * sentence rather than the server's: FastAPI's own words for these are "Request Entity
 * Too Large" and "Unsupported Media Type", which name the status code and not the
 * problem. This is the one place in the app that overrides the server's text, and it is
 * narrow on purpose — every other status still falls through to `describeApiError`.
 */
export function describeUploadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return `That image is too large. The limit is ${MAX_IMAGE_LABEL}.`
    if (error.status === 415) return `That file is not a ${TYPE_LABEL} image.`
  }
  return describeApiError(error)
}
