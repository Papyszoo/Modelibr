import { useScriptPreviewStore } from '@/stores/scriptPreviewStore'

const store = () => useScriptPreviewStore.getState()

beforeEach(() => {
  useScriptPreviewStore.setState({
    panelPosition: 'right',
    geometry: 'sphere',
    modelId: null,
  })
  localStorage.clear()
})

describe('scriptPreviewStore', () => {
  it('defaults to a right-hand sphere primitive with no model', () => {
    expect(store().panelPosition).toBe('right')
    expect(store().geometry).toBe('sphere')
    expect(store().modelId).toBeNull()
  })

  it('choosing a geometry clears any selected library model', () => {
    // Geometry and model are mutually exclusive subjects; picking a primitive
    // must drop the model so the preview doesn't keep rendering the old mesh.
    store().setModelId(42)
    expect(store().modelId).toBe(42)

    store().setGeometry('torus')
    expect(store().geometry).toBe('torus')
    expect(store().modelId).toBeNull()
  })

  it('choosing a model keeps the geometry (model just takes precedence)', () => {
    store().setGeometry('box')
    store().setModelId(7)
    expect(store().geometry).toBe('box')
    expect(store().modelId).toBe(7)
  })

  it('toggles the preview panel position', () => {
    store().setPanelPosition('bottom')
    expect(store().panelPosition).toBe('bottom')
  })
})
