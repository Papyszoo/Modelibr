import { ProgressBar } from 'primereact/progressbar'

interface UploadProgressProps {
  visible: boolean
  progress: number
}

export default function UploadProgress({
  visible,
  progress,
}: UploadProgressProps) {
  if (!visible) return null

  return (
    <div className="upload-progress">
      <p>Uploading files...</p>
      <ProgressBar value={progress} />
    </div>
  )
}