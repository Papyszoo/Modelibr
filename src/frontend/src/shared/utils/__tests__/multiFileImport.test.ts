import { groupFilesForImport } from '../multiFileImport'

// Build a File whose webkitRelativePath a folder picker would set.
function fileAt(path: string): File {
  const name = path.split('/').pop() ?? path
  const file = new File(['x'], name, { type: 'application/octet-stream' })
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

describe('groupFilesForImport', () => {
  // Regression: if the primary's directory were computed wrong, textures/.bin
  // would be assigned to the wrong model (or dropped), breaking multi-file glTF.
  it('groups a glTF-Sample-Assets subfolder as primary + relative auxiliaries', () => {
    const files = [
      fileAt('FlightHelmet/glTF/FlightHelmet.gltf'),
      fileAt('FlightHelmet/glTF/FlightHelmet.bin'),
      fileAt('FlightHelmet/glTF/FlightHelmet_Materials_baseColor.png'),
      fileAt('FlightHelmet/glTF/textures/wood.png'),
    ]

    const groups = groupFilesForImport(files)

    expect(groups).toHaveLength(1)
    expect(groups[0].primary.name).toBe('FlightHelmet.gltf')
    const paths = groups[0].auxiliaries.map(a => a.relativePath).sort()
    expect(paths).toEqual([
      'FlightHelmet.bin',
      'FlightHelmet_Materials_baseColor.png',
      'textures/wood.png',
    ])
  })

  // Regression: two models in one folder tree must not share/steal each other's
  // buffers — each aux belongs only to the primary under whose directory it sits.
  it('separates two models into two groups without cross-contamination', () => {
    const files = [
      fileAt('Models/A/glTF/A.gltf'),
      fileAt('Models/A/glTF/A.bin'),
      fileAt('Models/B/glTF/B.gltf'),
      fileAt('Models/B/glTF/B.bin'),
    ]

    const groups = groupFilesForImport(files)

    expect(groups).toHaveLength(2)
    const byPrimary = Object.fromEntries(
      groups.map(g => [g.primary.name, g.auxiliaries.map(a => a.relativePath)])
    )
    expect(byPrimary['A.gltf']).toEqual(['A.bin'])
    expect(byPrimary['B.gltf']).toEqual(['B.bin'])
  })

  // Regression: a self-contained model shouldn't invent auxiliaries.
  it('yields a group with no auxiliaries for a lone .glb', () => {
    const groups = groupFilesForImport([fileAt('kit/Barrel.glb')])
    expect(groups).toHaveLength(1)
    expect(groups[0].auxiliaries).toEqual([])
  })

  // Regression: a folder with no supported model file must produce nothing,
  // not crash or treat a texture as a model.
  it('returns no groups when there is no primary model file', () => {
    const groups = groupFilesForImport([
      fileAt('textures/wood.png'),
      fileAt('readme.txt'),
    ])
    expect(groups).toEqual([])
  })
})
