import './ScriptPreview.css'

import { useEffect, useRef, useState } from 'react'

import { isPreviewableLanguage } from '../utils/languages'

interface ScriptPreviewProps {
  language: string
  content: string
}

const VERTEX_SHADER = `attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`

/**
 * Wraps user GLSL so both common authoring styles render:
 *  - ShaderToy style: a `void mainImage(out vec4, in vec2)` entry point.
 *  - Raw fragment shader: its own `void main()` writing `gl_FragColor`.
 * Standard uniforms (iResolution/iTime/iMouse) are injected only when the source
 * does not already declare them, to avoid duplicate-declaration errors.
 */
function buildFragmentSource(content: string): string {
  const declares = (name: string) =>
    new RegExp(`uniform\\s+\\w+\\s+${name}\\b`).test(content)

  const preamble = [
    /precision\s+(highp|mediump|lowp)\s+float/.test(content)
      ? ''
      : 'precision highp float;',
    declares('iResolution') ? '' : 'uniform vec3 iResolution;',
    declares('iTime') ? '' : 'uniform float iTime;',
    declares('iMouse') ? '' : 'uniform vec4 iMouse;',
  ]
    .filter(Boolean)
    .join('\n')

  if (/\bmainImage\s*\(/.test(content)) {
    return `${preamble}
${content}
void main() {
  vec4 color = vec4(0.0);
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}`
  }

  return `${preamble}
${content}`
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): { shader: WebGLShader | null; error: string | null } {
  const shader = gl.createShader(type)
  if (!shader) return { shader: null, error: 'Could not create shader.' }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) || 'Unknown compile error.'
    gl.deleteShader(shader)
    return { shader: null, error }
  }
  return { shader, error: null }
}

export function ScriptPreview({ language, content }: ScriptPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    if (!isPreviewableLanguage(language)) return
    const canvas = canvasRef.current
    if (!canvas) return

    const gl =
      canvas.getContext('webgl') ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
    if (!gl) {
      setError('WebGL is not available in this browser.')
      return
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      buildFragmentSource(content)
    )
    if (!vs.shader || !fs.shader) {
      setError(fs.error || vs.error)
      return
    }

    const program = gl.createProgram()!
    gl.attachShader(program, vs.shader)
    gl.attachShader(program, fs.shader)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setError(gl.getProgramInfoLog(program) || 'Shader link failed.')
      return
    }
    setError(null)
    gl.useProgram(program)

    // Fullscreen quad.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    )
    const positionLoc = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    const iResolution = gl.getUniformLocation(program, 'iResolution')
    const iTime = gl.getUniformLocation(program, 'iTime')
    const iMouse = gl.getUniformLocation(program, 'iMouse')

    const mouse = { x: 0, y: 0 }
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = rect.height - (e.clientY - rect.top)
    }
    canvas.addEventListener('mousemove', onMouseMove)

    const start = performance.now()
    let frame = 0
    const render = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      if (iResolution) gl.uniform3f(iResolution, canvas.width, canvas.height, 1)
      if (iTime) gl.uniform1f(iTime, (performance.now() - start) / 1000)
      if (iMouse) gl.uniform4f(iMouse, mouse.x, mouse.y, 0, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!pausedRef.current) {
        frame = requestAnimationFrame(render)
      } else {
        frame = 0
      }
    }
    render()

    // Resume the loop whenever it was paused and is unpaused via re-render.
    const resumeInterval = window.setInterval(() => {
      if (!pausedRef.current && frame === 0) render()
    }, 200)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.clearInterval(resumeInterval)
      canvas.removeEventListener('mousemove', onMouseMove)
      gl.deleteProgram(program)
      gl.deleteBuffer(buffer)
      if (vs.shader) gl.deleteShader(vs.shader)
      if (fs.shader) gl.deleteShader(fs.shader)
    }
  }, [language, content])

  if (!isPreviewableLanguage(language)) {
    return (
      <div className="script-preview-unsupported" data-testid="script-preview">
        <i className="pi pi-eye-slash" aria-hidden="true" />
        <p>Live preview is available for GLSL/HLSL shaders.</p>
      </div>
    )
  }

  return (
    <div className="script-preview" data-testid="script-preview">
      <div className="script-preview-toolbar">
        <span className="script-preview-label">Shader preview</span>
        <button
          type="button"
          className="script-preview-toggle"
          onClick={() => setPaused(p => !p)}
          data-testid="script-preview-toggle"
        >
          <i className={`pi ${paused ? 'pi-play' : 'pi-pause'}`} />
          {paused ? 'Play' : 'Pause'}
        </button>
      </div>
      <div className="script-preview-canvas-wrap">
        <canvas ref={canvasRef} className="script-preview-canvas" />
        {error && (
          <pre
            className="script-preview-error"
            data-testid="script-preview-error"
          >
            {error}
          </pre>
        )}
      </div>
    </div>
  )
}
