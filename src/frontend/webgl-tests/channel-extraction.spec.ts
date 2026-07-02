import { expect, type Page, test } from '@playwright/test'

import {
  CHANNEL_EXTRACT_FRAGMENT_SHADER,
  CHANNEL_VERTEX_SHADER,
  getChannelUniformIndex,
  RGB_INVERT_FRAGMENT_SHADER,
  TEXTURE_CHANNEL,
} from '../../asset-processor/lib/textureChannels.js'

/**
 * Isolated regression test for the SHARED channel-extraction / invert GLSL
 * (asset-processor/lib/textureChannels.js) that the viewer, worker, and demo all
 * depend on. It runs the actual shared shaders in a real WebGL2 context (forced
 * SwiftShader, so a GPU dev box and a GPU-less CI runner behave identically),
 * feeds a 1×1 texture with distinct per-channel values, and reads the rendered
 * pixel back.
 *
 * Unlike the full-app E2E — which only asserts that *some* map object landed on
 * the material — this asserts the extraction produced the RIGHT channel with the
 * RIGHT value (and that invert flips it). It catches: a wrong channel index, a
 * broken invert, TEXTURE_CHANNEL→uChannel drift, or GLSL that stops compiling —
 * none of which the "a map exists" E2E check can see. No app, backend, or
 * thumbnail render is involved, so it does not ride the flaky GPU-less render at
 * the tail of a drained Docker run.
 */

// Distinct per-channel bytes so a wrong channel or a missing invert is obvious.
const SRC = { r: 51, g: 128, b: 204, a: 255 } as const

// Software rasterisation of a 1×1 NEAREST texture is exact; allow ±2 only for
// any byte-rounding on the way through the framebuffer.
const TOL = 2

type Pixel = [number, number, number, number]

/**
 * Render one fullscreen-quad pass with the given fragment shader over a 1×1
 * source texture and read the resulting pixel back.
 */
async function renderPass(
  page: Page,
  opts: {
    fragmentShader: string
    src: { r: number; g: number; b: number; a: number }
    uChannel?: number
    uInvert?: number
  }
): Promise<Pixel> {
  return page.evaluate(
    ({ vertexShader, fragmentShader, src, uChannel, uInvert }): Pixel => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: false,
      })
      if (!gl) throw new Error('WebGL2 context unavailable')

      const compile = (type: number, source: string): WebGLShader => {
        const shader = gl.createShader(type)!
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(`compile failed: ${gl.getShaderInfoLog(shader)}`)
        }
        return shader
      }

      // three.js ShaderMaterial injects the quad attributes and a precision
      // qualifier; declare them explicitly so the raw context runs the exact
      // shared GLSL.
      const program = gl.createProgram()!
      gl.attachShader(
        program,
        compile(
          gl.VERTEX_SHADER,
          `attribute vec3 position;\nattribute vec2 uv;\n${vertexShader}`
        )
      )
      gl.attachShader(
        program,
        compile(gl.FRAGMENT_SHADER, `precision highp float;\n${fragmentShader}`)
      )
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`link failed: ${gl.getProgramInfoLog(program)}`)
      }
      gl.useProgram(program)

      // Fullscreen quad (triangle strip) in clip space with matching UVs.
      const bind = (name: string, size: number, data: number[]) => {
        const loc = gl.getAttribLocation(program, name)
        const buf = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
      }
      bind('position', 3, [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0])
      bind('uv', 2, [0, 0, 1, 0, 0, 1, 1, 1])

      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([src.r, src.g, src.b, src.a])
      )
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

      gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0)
      if (uChannel !== undefined) {
        gl.uniform1i(gl.getUniformLocation(program, 'uChannel'), uChannel)
      }
      if (uInvert !== undefined) {
        gl.uniform1i(gl.getUniformLocation(program, 'uInvert'), uInvert)
      }

      gl.viewport(0, 0, 1, 1)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      const out = new Uint8Array(4)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
      return [out[0], out[1], out[2], out[3]]
    },
    {
      vertexShader: CHANNEL_VERTEX_SHADER,
      fragmentShader: opts.fragmentShader,
      src: opts.src,
      uChannel: opts.uChannel,
      uInvert: opts.uInvert,
    }
  )
}

test.describe('shared channel-extraction shaders (WebGL2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('about:blank')
  })

  test('extracts each channel to greyscale', async ({ page }) => {
    const cases: Array<[number, number]> = [
      [TEXTURE_CHANNEL.R, SRC.r],
      [TEXTURE_CHANNEL.G, SRC.g],
      [TEXTURE_CHANNEL.B, SRC.b],
      [TEXTURE_CHANNEL.A, SRC.a],
    ]

    for (const [channel, expected] of cases) {
      const [r, g, b, a] = await renderPass(page, {
        fragmentShader: CHANNEL_EXTRACT_FRAGMENT_SHADER,
        src: SRC,
        uChannel: getChannelUniformIndex(channel),
        uInvert: 0,
      })
      expect(Math.abs(r - expected)).toBeLessThanOrEqual(TOL)
      // Extracted channel is written to all three colour channels (greyscale).
      expect(r).toBe(g)
      expect(g).toBe(b)
      expect(a).toBe(255)
    }
  })

  test('inverts the extracted channel (Glossiness → Roughness)', async ({
    page,
  }) => {
    const [r] = await renderPass(page, {
      fragmentShader: CHANNEL_EXTRACT_FRAGMENT_SHADER,
      src: SRC,
      uChannel: getChannelUniformIndex(TEXTURE_CHANNEL.G),
      uInvert: 1,
    })
    expect(Math.abs(r - (255 - SRC.g))).toBeLessThanOrEqual(TOL)
  })

  test('RGB invert flips each colour channel and preserves alpha', async ({
    page,
  }) => {
    const [r, g, b, a] = await renderPass(page, {
      fragmentShader: RGB_INVERT_FRAGMENT_SHADER,
      src: SRC,
    })
    expect(Math.abs(r - (255 - SRC.r))).toBeLessThanOrEqual(TOL)
    expect(Math.abs(g - (255 - SRC.g))).toBeLessThanOrEqual(TOL)
    expect(Math.abs(b - (255 - SRC.b))).toBeLessThanOrEqual(TOL)
    expect(a).toBe(255)
  })
})

test('getChannelUniformIndex maps TextureChannel to 0-based shader indices', () => {
  // Guards the frontend↔worker channel-numbering drift this shared module fixed.
  expect(getChannelUniformIndex(TEXTURE_CHANNEL.R)).toBe(0)
  expect(getChannelUniformIndex(TEXTURE_CHANNEL.G)).toBe(1)
  expect(getChannelUniformIndex(TEXTURE_CHANNEL.B)).toBe(2)
  expect(getChannelUniformIndex(TEXTURE_CHANNEL.A)).toBe(3)
  // RGB (whole-texture) and unknown values fall back to 0.
  expect(getChannelUniformIndex(TEXTURE_CHANNEL.RGB)).toBe(0)
})
