import { describe, it, expect, vi } from 'vitest'

vi.mock('../logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}))

// Tiny cap/timeout so the enforcement paths are exercised without huge fixtures.
vi.mock('../config.js', () => ({
  config: {
    extraction: {
      materialSampleSize: 256,
      scriptMaxBytes: 200,
      scriptTimeoutMs: 5000,
    },
  },
}))

import {
  extractScript,
  extractScriptForImport,
  SCRIPT_EXTRACTOR_VERSION,
} from '../scriptExtractor.js'

describe('extractScript - JavaScript', () => {
  it('extracts functions, classes, imports and comment count', async () => {
    const source = [
      "import { thing } from './thing.js'",
      '// a comment',
      'export function doWork(a, b) { return a + b }',
      'class Widget { render() {} }',
    ].join('\n')

    const { payload, outcome } = await extractScript({
      language: 'javascript',
      sourceText: source,
    })

    expect(outcome).toBe('Complete')
    expect(payload.parsed).toBe(true)
    expect(payload.symbols.functions).toContain('doWork')
    expect(payload.symbols.functions).toContain('render')
    expect(payload.symbols.types).toContain('Widget')
    expect(payload.symbols.imports.length).toBeGreaterThan(0)
    expect(payload.commentCount).toBe(1)
  })
})

describe('extractScript - Python', () => {
  it('extracts def/class and both import forms', async () => {
    const source = [
      'import os',
      'from sys import argv',
      'def greet(name):',
      '    return name',
      'class Robot:',
      '    pass',
    ].join('\n')

    const { payload } = await extractScript({
      language: 'python',
      sourceText: source,
    })

    expect(payload.symbols.functions).toContain('greet')
    expect(payload.symbols.types).toContain('Robot')
    expect(payload.symbols.imports).toEqual(
      expect.arrayContaining(['import os', 'from sys import argv'])
    )
  })
})

describe('extractScript - engine detection', () => {
  it('detects Unity from C# base type and namespace', async () => {
    const source = [
      'using UnityEngine;',
      'public class Player : MonoBehaviour {',
      '  void Update() {}',
      '}',
    ].join('\n')

    const { payload } = await extractScript({
      language: 'csharp',
      sourceText: source,
    })

    expect(payload.engine).toBe('Unity')
    expect(payload.symbols.types).toContain('Player')
    expect(payload.symbols.functions).toContain('Update')
  })

  it('detects Godot from GDScript-style base type', async () => {
    // gdscript has no grammar → surface signals only, but engine still detected.
    const source = 'extends Node2D\nfunc _ready():\n\tpass\n'
    const { payload, outcome } = await extractScript({
      language: 'gdscript',
      sourceText: source,
    })
    expect(payload.engine).toBe('Godot')
    expect(payload.parsed).toBe(false)
    expect(outcome).toBe('Partial')
  })
})

describe('extractScript - sensitive API surfacing', () => {
  it('reports network / filesystem / process references without blocking', async () => {
    const source = [
      "const child_process = require('child_process')",
      "fetch('https://evil.example')",
      "const fs = require('fs'); fs.unlink('x')",
      "child_process.spawn('rm')",
    ].join('\n')

    const { payload, outcome } = await extractScript({
      language: 'javascript',
      sourceText: source,
    })

    // Report, never block: outcome is not Failed just because APIs are touched.
    expect(outcome).toBe('Complete')
    expect(payload.sensitiveApis.network).toContain('fetch')
    expect(payload.sensitiveApis.filesystem).toContain('unlink')
    expect(payload.sensitiveApis.process).toEqual(
      expect.arrayContaining(['spawn'])
    )
  })
})

describe('extractScript - shader stage + samplers', () => {
  it('detects fragment stage and sampler uniforms in GLSL', async () => {
    const source = [
      'uniform sampler2D uAlbedo;',
      'uniform sampler2D uNormal;',
      'out vec4 fragColor;',
      'void main() { fragColor = texture(uAlbedo, vec2(0.0)); }',
    ].join('\n')

    const { payload } = await extractScript({
      language: 'glsl',
      sourceText: source,
    })

    expect(payload.shader.stage).toBe('fragment')
    expect(payload.shader.samplers).toEqual(['uAlbedo', 'uNormal'])
  })
})

describe('extractScript - bounds', () => {
  it('skips parsing when the source exceeds the byte cap', async () => {
    const big = 'const x = 1\n'.repeat(100) // > 200-byte mocked cap
    const { payload, warnings, outcome } = await extractScript({
      language: 'javascript',
      sourceText: big,
    })

    expect(payload.parsed).toBe(false)
    expect(outcome).toBe('Partial')
    expect(warnings.some(w => /cap/.test(w))).toBe(true)
    // Surface signals still recorded.
    expect(payload.lineCount).toBeGreaterThan(1)
  })
})

describe('extractScriptForImport', () => {
  it('adds a stable source hash and extractor/schema versions', async () => {
    const source = 'def a():\n    return 1\n'
    const first = await extractScriptForImport({
      language: 'python',
      sourceText: source,
    })
    const second = await extractScriptForImport({
      language: 'python',
      sourceText: source,
    })

    expect(first.fileSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(first.fileSha256).toBe(second.fileSha256)
    expect(first.extractorVersion).toBe(SCRIPT_EXTRACTOR_VERSION)
    expect(first.schemaVersion).toBe(1)
  })
})
