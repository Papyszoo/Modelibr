/**
 * WebGL 2 polyfill for headless-gl
 * headless-gl only supports WebGL 1, but THREE.js r180 requires WebGL 2
 * This module adds minimal WebGL 2 API stubs to make THREE.js work
 */

/**
 * Add WebGL 2 API compatibility to a WebGL 1 context
 * @param {WebGLRenderingContext} gl - WebGL 1 context from headless-gl
 * @returns {WebGL2RenderingContext-like} Enhanced context with WebGL 2 stubs
 */
export function polyfillWebGL2(gl) {
  if (!gl) {
    throw new Error('Cannot polyfill null/undefined GL context')
  }

  // Add WebGL 2 constants
  const webgl2Constants = {
    // Texture formats
    RGBA8: 0x8058,
    DEPTH_COMPONENT24: 0x81a6,
    DEPTH_COMPONENT32F: 0x8cac,
    DEPTH24_STENCIL8: 0x88f0,
    DEPTH32F_STENCIL8: 0x8cad,

    // Framebuffer targets
    READ_FRAMEBUFFER: 0x8ca8,
    DRAW_FRAMEBUFFER: 0x8ca9,

    // Additional color attachments
    COLOR_ATTACHMENT1: 0x8ce1,
    COLOR_ATTACHMENT2: 0x8ce2,
    COLOR_ATTACHMENT3: 0x8ce3,

    // Texture compare mode
    COMPARE_REF_TO_TEXTURE: 0x884e,
  }

  Object.assign(gl, webgl2Constants)

  // VAO (Vertex Array Object) implementation
  const vaoMap = new WeakMap()

  gl.createVertexArray =
    gl.createVertexArray ||
    function () {
      const vao = { bindings: {} }
      vaoMap.set(vao, true)
      return vao
    }

  gl.deleteVertexArray =
    gl.deleteVertexArray ||
    function (vao) {
      if (vao) {
        vaoMap.delete(vao)
      }
    }

  gl.bindVertexArray =
    gl.bindVertexArray ||
    function (_vao) {
      // No-op: VAO binding not needed in headless rendering
    }

  gl.isVertexArray =
    gl.isVertexArray ||
    function (vao) {
      return vao && vaoMap.has(vao)
    }

  // 3D Texture methods (no-op implementations)
  gl.texImage3D = gl.texImage3D || function () {}
  gl.texSubImage3D = gl.texSubImage3D || function () {}
  gl.compressedTexImage3D = gl.compressedTexImage3D || function () {}
  gl.compressedTexSubImage3D = gl.compressedTexSubImage3D || function () {}
  gl.copyTexSubImage3D = gl.copyTexSubImage3D || function () {}

  // Texture storage
  gl.texStorage2D = gl.texStorage2D || function () {}
  gl.texStorage3D = gl.texStorage3D || function () {}

  // Buffer methods
  gl.getBufferSubData = gl.getBufferSubData || function () {}
  gl.copyBufferSubData = gl.copyBufferSubData || function () {}

  // Framebuffer methods
  gl.blitFramebuffer = gl.blitFramebuffer || function () {}
  gl.framebufferTextureLayer = gl.framebufferTextureLayer || function () {}
  gl.invalidateFramebuffer = gl.invalidateFramebuffer || function () {}
  gl.invalidateSubFramebuffer = gl.invalidateSubFramebuffer || function () {}
  gl.readBuffer = gl.readBuffer || function () {}

  // Renderbuffer methods
  gl.renderbufferStorageMultisample =
    gl.renderbufferStorageMultisample || function () {}
  gl.getInternalformatParameter =
    gl.getInternalformatParameter ||
    function () {
      return []
    }

  // Query objects (no-op implementations)
  gl.createQuery =
    gl.createQuery ||
    function () {
      return {}
    }
  gl.deleteQuery = gl.deleteQuery || function () {}
  gl.beginQuery = gl.beginQuery || function () {}
  gl.endQuery = gl.endQuery || function () {}
  gl.getQuery =
    gl.getQuery ||
    function () {
      return null
    }
  gl.getQueryParameter =
    gl.getQueryParameter ||
    function () {
      return null
    }

  // Sampler objects (no-op implementations)
  gl.createSampler =
    gl.createSampler ||
    function () {
      return {}
    }
  gl.deleteSampler = gl.deleteSampler || function () {}
  gl.bindSampler = gl.bindSampler || function () {}
  gl.samplerParameteri = gl.samplerParameteri || function () {}
  gl.samplerParameterf = gl.samplerParameterf || function () {}
  gl.getSamplerParameter =
    gl.getSamplerParameter ||
    function () {
      return null
    }

  // Transform feedback (no-op implementations)
  gl.createTransformFeedback =
    gl.createTransformFeedback ||
    function () {
      return {}
    }
  gl.deleteTransformFeedback = gl.deleteTransformFeedback || function () {}
  gl.bindTransformFeedback = gl.bindTransformFeedback || function () {}
  gl.beginTransformFeedback = gl.beginTransformFeedback || function () {}
  gl.endTransformFeedback = gl.endTransformFeedback || function () {}
  gl.transformFeedbackVaryings = gl.transformFeedbackVaryings || function () {}
  gl.getTransformFeedbackVarying =
    gl.getTransformFeedbackVarying ||
    function () {
      return null
    }
  gl.pauseTransformFeedback = gl.pauseTransformFeedback || function () {}
  gl.resumeTransformFeedback = gl.resumeTransformFeedback || function () {}

  // Uniform buffer objects (no-op implementations)
  gl.bindBufferBase = gl.bindBufferBase || function () {}
  gl.bindBufferRange = gl.bindBufferRange || function () {}
  gl.getUniformIndices =
    gl.getUniformIndices ||
    function () {
      return []
    }
  gl.getActiveUniforms =
    gl.getActiveUniforms ||
    function () {
      return []
    }
  gl.getUniformBlockIndex =
    gl.getUniformBlockIndex ||
    function () {
      return 0
    }
  gl.getActiveUniformBlockParameter =
    gl.getActiveUniformBlockParameter ||
    function () {
      return null
    }
  gl.getActiveUniformBlockName =
    gl.getActiveUniformBlockName ||
    function () {
      return ''
    }
  gl.uniformBlockBinding = gl.uniformBlockBinding || function () {}

  // Sync objects (no-op implementations)
  gl.fenceSync =
    gl.fenceSync ||
    function () {
      return {}
    }
  gl.isSync =
    gl.isSync ||
    function () {
      return false
    }
  gl.deleteSync = gl.deleteSync || function () {}
  gl.clientWaitSync =
    gl.clientWaitSync ||
    function () {
      return gl.CONDITION_SATISFIED || 0x911c
    }
  gl.waitSync = gl.waitSync || function () {}
  gl.getSyncParameter =
    gl.getSyncParameter ||
    function () {
      return null
    }

  // Additional getParameter support for WebGL 2 parameters
  const originalGetParameter = gl.getParameter
  gl.getParameter = function (pname) {
    // Return sensible defaults for WebGL 2 parameters
    if (pname === gl.MAX_COLOR_ATTACHMENTS) return 4
    if (pname === gl.MAX_DRAW_BUFFERS) return 4
    if (pname === gl.MAX_3D_TEXTURE_SIZE) return 256
    if (pname === gl.MAX_ARRAY_TEXTURE_LAYERS) return 256
    return originalGetParameter.call(this, pname)
  }

  return gl
}
