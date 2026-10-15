/**
 * Copies text to the clipboard, reporting success instead of throwing.
 *
 * `navigator.clipboard` is only defined in a secure context, so over plain
 * `http://<lan-ip>` it is undefined and a bare `navigator.clipboard.writeText`
 * would throw. Callers show their existing "failed to copy" feedback when this
 * resolves false. Same guarded pattern already used by
 * `utils/webdavUtils.ts#copyPathToClipboard`.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return false
    }

    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
