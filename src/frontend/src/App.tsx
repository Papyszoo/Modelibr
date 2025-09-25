import { NuqsAdapter } from 'nuqs/adapters/react'
import SplitterLayout from './components/layout/SplitterLayout'
import './App.css'

function App(): JSX.Element {
  return (
    <NuqsAdapter>
      <SplitterLayout />
    </NuqsAdapter>
  )
}

export default App
