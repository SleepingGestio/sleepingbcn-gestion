// Shared (client + server) size limits for maintenance attachments.
// A file counts as a video when the chosen tipus is "video" OR its MIME type
// starts with "video/" (some pickers store videos under tipus "document").

export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
export const MAX_OTHER_BYTES = 25 * 1024 * 1024;

// Prefix of the Error message thrown by uploadAdjunto when a file is too big,
// so the client can show the size message instead of the generic one.
export const ADJUNTO_TOO_LARGE_PREFIX = "ADJUNTO_TOO_LARGE:";

export function isVideoAdjunto(tipo: string | null | undefined, mime: string | null | undefined): boolean {
  return tipo === "video" || (mime ?? "").startsWith("video/");
}

function fmtMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
}

/** Returns a Spanish error message if the file exceeds its limit, otherwise null. */
export function adjuntoSizeError(
  tipo: string | null | undefined,
  file: { size: number; type?: string },
): string | null {
  const video = isVideoAdjunto(tipo, file.type);
  const max = video ? MAX_VIDEO_BYTES : MAX_OTHER_BYTES;
  if (file.size <= max) return null;
  const maxMB = fmtMB(max);
  if (video) {
    return `El vídeo pesa ${fmtMB(file.size)} MB; el máximo es ${maxMB} MB. Graba en menor calidad (720p) o acórtalo.`;
  }
  return `El archivo pesa ${fmtMB(file.size)} MB; el máximo es ${maxMB} MB.`;
}

/** Message to show when an upload fails: the size message if that was the cause, else the generic one. */
export function adjuntoUploadErrorMessage(e: unknown, fileName: string, generic: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  const i = msg.indexOf(ADJUNTO_TOO_LARGE_PREFIX);
  if (i >= 0) return msg.slice(i + ADJUNTO_TOO_LARGE_PREFIX.length).trim();
  return generic.replace("{nombre}", fileName);
}
