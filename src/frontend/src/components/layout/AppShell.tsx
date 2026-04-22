import { useIsMobile } from '@/shared/hooks/useMediaQuery'

import { MobileShell } from './MobileShell'
import { SplitterLayout } from './SplitterLayout'

/**
 * Top-level layout switch. Renders the desktop two-panel splitter or the
 * mobile single-panel shell based on viewport width.
 */
export function AppShell() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileShell /> : <SplitterLayout />
}
