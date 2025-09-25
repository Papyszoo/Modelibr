import { useEffect } from 'react'

/**
 * Custom hook to prevent the browser's default behavior when files are dragged
 * anywhere on the window (outside of designated drop zones).
 * 
 * This prevents the common issue where dragging files accidentally opens them
 * in the browser instead of being handled by the application's drag & drop logic.
 */
export function useGlobalDragPrevention(): void {
  useEffect(() => {
    /**
     * Prevent default dragover behavior globally
     * This is required to allow drop events to work properly
     */
    const handleGlobalDragOver = (e: DragEvent): void => {
      e.preventDefault()
    }

    /**
     * Prevent default drop behavior globally
     * This prevents the browser from navigating to/opening dropped files
     */
    const handleGlobalDrop = (e: DragEvent): void => {
      e.preventDefault()
    }

    // Add event listeners to the window
    window.addEventListener('dragover', handleGlobalDragOver, false)
    window.addEventListener('drop', handleGlobalDrop, false)

    // Cleanup function to remove event listeners on unmount
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver, false)
      window.removeEventListener('drop', handleGlobalDrop, false)
    }
  }, []) // Empty dependency array means this effect runs once on mount and cleans up on unmount
}