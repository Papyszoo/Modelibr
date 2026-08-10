import { createRequire } from 'module'
import crypto from 'crypto'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Script / shader extraction via tree-sitter (parse-only, offline-safe).
 *
 * Grammars are prebuilt WASM shipped by `tree-sitter-wasms` and run through the
 * `web-tree-sitter` WASM runtime — no native toolchain, no network, so it honours
 * the local-first invariant. The two packages are ABI-coupled: keep
 * `web-tree-sitter@0.20.x` paired with `tree-sitter-wasms@0.1.x` (grammars built
 * for the 0.20 language ABI). A newer runtime rejects these grammars with a
 * "dylink metadata" error.
 *
 * Safety: uploaded code is NEVER executed. We parse only, bounded by a byte cap
 * and a per-file parse timeout (both config-driven), and we *report* which
 * sensitive APIs a script references (network / filesystem / process spawn) as
 * advisory info for whoever downloads it — no score, never a block.
 */

const require = createRequire(import.meta.url)

export const SCRIPT_EXTRACTOR_VERSION = 1

let parserInitPromise = null
const languageCache = new Map()

/** FileType value (Domain.ValueObjects.FileType) → tree-sitter-wasms grammar name. */
const GRAMMAR_BY_LANGUAGE = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  csharp: 'c_sharp',
  cpp: 'cpp',
  c: 'c',
  lua: 'lua',
  java: 'java',
  go: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  shell: 'bash',
  json: 'json',
  yaml: 'yaml',
  // Shaders are C-like; the cpp grammar gives a usable structural parse.
  glsl: 'cpp',
  hlsl: 'cpp',
}

/**
 * Per-language node types for declared symbols and imports. Extraction is
 * defensive: any type absent from a given grammar simply yields nothing.
 */
const LANGUAGE_SPEC = {
  javascript: {
    functions: [
      'function_declaration',
      'method_definition',
      'generator_function_declaration',
    ],
    types: ['class_declaration'],
    imports: ['import_statement'],
    comments: ['comment'],
  },
  typescript: {
    functions: [
      'function_declaration',
      'method_definition',
      'function_signature',
    ],
    types: [
      'class_declaration',
      'interface_declaration',
      'type_alias_declaration',
      'enum_declaration',
    ],
    imports: ['import_statement'],
    comments: ['comment'],
  },
  python: {
    functions: ['function_definition'],
    types: ['class_definition'],
    imports: ['import_statement', 'import_from_statement'],
    comments: ['comment'],
  },
  csharp: {
    functions: [
      'method_declaration',
      'constructor_declaration',
      'local_function_statement',
    ],
    types: [
      'class_declaration',
      'struct_declaration',
      'interface_declaration',
      'enum_declaration',
      'record_declaration',
    ],
    imports: ['using_directive'],
    comments: ['comment'],
  },
  cpp: {
    functions: ['function_definition'],
    types: ['class_specifier', 'struct_specifier', 'enum_specifier'],
    imports: ['preproc_include'],
    comments: ['comment'],
  },
  c: {
    functions: ['function_definition'],
    types: ['struct_specifier', 'enum_specifier'],
    imports: ['preproc_include'],
    comments: ['comment'],
  },
  lua: {
    functions: [
      'function_declaration',
      'function_definition',
      'function_statement',
    ],
    types: [],
    imports: [],
    comments: ['comment'],
  },
  java: {
    functions: ['method_declaration', 'constructor_declaration'],
    types: [
      'class_declaration',
      'interface_declaration',
      'enum_declaration',
      'record_declaration',
    ],
    imports: ['import_declaration'],
    comments: ['line_comment', 'block_comment', 'comment'],
  },
  go: {
    functions: ['function_declaration', 'method_declaration'],
    types: ['type_declaration'],
    imports: ['import_declaration'],
    comments: ['comment'],
  },
  rust: {
    functions: ['function_item'],
    types: ['struct_item', 'enum_item', 'trait_item', 'impl_item'],
    imports: ['use_declaration'],
    comments: ['line_comment', 'block_comment'],
  },
  ruby: {
    functions: ['method', 'singleton_method'],
    types: ['class', 'module'],
    imports: [],
    comments: ['comment'],
  },
  php: {
    functions: ['function_definition', 'method_declaration'],
    types: [
      'class_declaration',
      'interface_declaration',
      'trait_declaration',
      'enum_declaration',
    ],
    imports: ['namespace_use_declaration'],
    comments: ['comment'],
  },
}

// Sensitive-API identifiers grouped by concern. Matched as whole words against the
// raw source (advisory only) — false positives are acceptable, silent misses on
// obvious cases are not.
const SENSITIVE_APIS = {
  network: [
    'fetch',
    'XMLHttpRequest',
    'axios',
    'WebSocket',
    'requests',
    'urllib',
    'urlopen',
    'httpx',
    'HttpClient',
    'WebClient',
    'socket',
    'curl',
    'wget',
    'net\\.Dial',
    'URLSession',
  ],
  filesystem: [
    'readFile',
    'writeFile',
    'unlink',
    'rmdir',
    'fopen',
    'ofstream',
    'ifstream',
    'File\\.Delete',
    'File\\.WriteAllText',
    'File\\.ReadAllText',
    'os\\.remove',
    'os\\.rmdir',
    'shutil',
    'Directory\\.Delete',
    'io\\.open',
  ],
  process: [
    'exec',
    'execSync',
    'spawn',
    'spawnSync',
    'child_process',
    'subprocess',
    'os\\.system',
    'Process\\.Start',
    'Runtime\\.getRuntime',
    'popen',
    'system',
    'ProcessBuilder',
  ],
}

// Engine-detection heuristics over the raw source. First match wins; null when unknown.
const ENGINE_HEURISTICS = [
  {
    engine: 'Unity',
    test: /\busing\s+UnityEngine\b|:\s*MonoBehaviour\b|\[SerializeField\]/,
  },
  {
    engine: 'Unreal',
    test: /\bUCLASS\s*\(|\bUPROPERTY\s*\(|\bAActor\b|#include\s+"CoreMinimal\.h"/,
  },
  {
    engine: 'Godot',
    test: /\bextends\s+(Node|Node2D|Node3D|Control|Resource|CharacterBody)\b|\bfunc\s+_ready\b|\bfunc\s+_process\b/,
  },
  {
    engine: 'Roblox',
    test: /\bgame:GetService\b|\bInstance\.new\b|\bworkspace\b/,
  },
  {
    engine: 'Defold',
    test: /\bgo\.property\b|\bmsg\.post\b|\bgo\.get_position\b/,
  },
  { engine: 'LÖVE', test: /\blove\.(load|update|draw)\b/ },
]

async function getParser() {
  if (!parserInitPromise) {
    const Parser = require('web-tree-sitter')
    parserInitPromise = Parser.init({
      locateFile: () => require.resolve('web-tree-sitter/tree-sitter.wasm'),
    }).then(() => Parser)
  }
  return parserInitPromise
}

async function loadLanguage(Parser, grammar) {
  if (!languageCache.has(grammar)) {
    const wasmPath = require.resolve(
      `tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`
    )
    languageCache.set(grammar, await Parser.Language.load(wasmPath))
  }
  return languageCache.get(grammar)
}

/** Name of a declaration node, best-effort across grammars. */
function symbolName(node) {
  const named = node.childForFieldName('name')
  if (named?.text) return named.text
  // Fall back to the first identifier-ish descendant.
  const idTypes = [
    'identifier',
    'type_identifier',
    'name',
    'constant',
    'field_identifier',
  ]
  for (const child of node.namedChildren) {
    if (idTypes.includes(child.type) && child.text) return child.text
  }
  return null
}

function collectNames(root, typeList) {
  if (!typeList || typeList.length === 0) return []
  const names = new Set()
  for (const node of root.descendantsOfType(typeList)) {
    const name = symbolName(node)
    if (name) names.add(name)
  }
  return [...names].sort()
}

function countComments(root, typeList) {
  if (!typeList || typeList.length === 0) return 0
  return root.descendantsOfType(typeList).length
}

function detectEngine(source) {
  for (const { engine, test } of ENGINE_HEURISTICS) {
    if (test.test(source)) return engine
  }
  return null
}

function surfaceSensitiveApis(source) {
  const result = {}
  for (const [category, patterns] of Object.entries(SENSITIVE_APIS)) {
    const hits = new Set()
    for (const pattern of patterns) {
      const re = new RegExp(`\\b${pattern}\\b`)
      if (re.test(source))
        hits.add(pattern.replace(/\\\./g, '.').replace(/\\b/g, ''))
    }
    if (hits.size > 0) result[category] = [...hits].sort()
  }
  return result
}

/** Shader stage + sampler surface, text-heuristic (glsl/hlsl only). */
function shaderInfo(language, source) {
  if (language !== 'glsl' && language !== 'hlsl') return null

  let stage = null
  if (/\bgl_Position\b/.test(source) || /\bSV_POSITION\b/i.test(source))
    stage = 'vertex'
  else if (
    /\bgl_FragColor\b|\bSV_Target\b/i.test(source) ||
    /\bout\s+vec4\b/.test(source)
  )
    stage = 'fragment'
  else if (/\bnumthreads\b|\blocal_size_x\b/.test(source)) stage = 'compute'

  const samplers = new Set()
  const glslSampler = /\buniform\s+(?:sampler\w+|texture\w+)\s+(\w+)/g
  const hlslSampler = /\b(?:Texture\w+|SamplerState)\s+(\w+)/g
  let m
  while ((m = glslSampler.exec(source))) samplers.add(m[1])
  while ((m = hlslSampler.exec(source))) samplers.add(m[1])

  return { stage, samplers: [...samplers].sort() }
}

function normalizeLanguage(language) {
  return String(language || '')
    .trim()
    .toLowerCase()
}

/**
 * Extract structural metadata from a script/shader source string.
 *
 * @param {Object} args
 * @param {string} args.language - FileType value (javascript, python, csharp, glsl, …).
 * @param {string} args.sourceText - Full source (already read; caller enforces IO).
 * @returns {Promise<{payload: Object, warnings: string[], outcome: string}>}
 */
export async function extractScript({ language, sourceText }) {
  const lang = normalizeLanguage(language)
  const source = sourceText ?? ''
  const byteLength = Buffer.byteLength(source, 'utf8')
  const lineCount = source.length === 0 ? 0 : source.split(/\r\n|\r|\n/).length
  const warnings = []

  // Signals that never need a parse — always available even for unsupported langs.
  const base = {
    version: SCRIPT_EXTRACTOR_VERSION,
    language: lang,
    byteLength,
    lineCount,
    engine: detectEngine(source),
    sensitiveApis: surfaceSensitiveApis(source),
    shader: shaderInfo(lang, source),
    symbols: { functions: [], types: [], imports: [] },
    commentCount: null,
    parsed: false,
  }

  const grammar = GRAMMAR_BY_LANGUAGE[lang]
  if (!grammar) {
    warnings.push(
      `No tree-sitter grammar for language '${lang}'; recorded surface signals only`
    )
    return { payload: base, warnings, outcome: 'Partial' }
  }

  if (byteLength > config.extraction.scriptMaxBytes) {
    warnings.push(
      `Source is ${byteLength} bytes (> cap ${config.extraction.scriptMaxBytes}); parse skipped`
    )
    return { payload: base, warnings, outcome: 'Partial' }
  }

  try {
    const Parser = await getParser()
    const langObj = await loadLanguage(Parser, grammar)
    const parser = new Parser()
    parser.setLanguage(langObj)
    // Bound the parse so a pathological input can never hang a worker slot.
    parser.setTimeoutMicros(config.extraction.scriptTimeoutMs * 1000)

    let tree
    try {
      tree = parser.parse(source)
    } finally {
      parser.delete?.()
    }

    if (!tree) {
      warnings.push(
        `Parse exceeded ${config.extraction.scriptTimeoutMs}ms timeout; recorded surface signals only`
      )
      return { payload: base, warnings, outcome: 'Partial' }
    }

    const spec = LANGUAGE_SPEC[lang] || LANGUAGE_SPEC[grammar] || {}
    const root = tree.rootNode
    // Imports carry no "name" field — the useful value is the statement text
    // (module specifier + form), deduped and capped.
    const imports = spec.imports?.length
      ? [
          ...new Set(
            root
              .descendantsOfType(spec.imports)
              .map(n => n.text.trim())
              .filter(Boolean)
          ),
        ]
          .sort()
          .slice(0, 200)
      : []
    const payload = {
      ...base,
      parsed: true,
      symbols: {
        functions: collectNames(root, spec.functions),
        types: collectNames(root, spec.types),
        imports,
      },
      commentCount: countComments(root, spec.comments),
    }

    // `hasError` is a method in web-tree-sitter 0.20; tolerate a getter too.
    const hasError =
      typeof root.hasError === 'function' ? root.hasError() : !!root.hasError
    const outcome = hasError ? 'Partial' : 'Complete'
    if (hasError)
      warnings.push('Source has parse errors; extraction is best-effort')

    tree.delete?.()
    return { payload, warnings, outcome }
  } catch (error) {
    logger.warn('Script parse failed, recording surface signals only', {
      language: lang,
      error: error.message,
    })
    warnings.push(`Parse failed: ${error.message}`)
    return { payload: base, warnings, outcome: 'Failed' }
  }
}

/**
 * Convenience wrapper that also computes the invalidation hash from the source
 * bytes, matching the shape ModelDataService.saveExtraction expects.
 */
export async function extractScriptForImport({ language, sourceText }) {
  const { payload, warnings, outcome } = await extractScript({
    language,
    sourceText,
  })
  const fileSha256 = crypto
    .createHash('sha256')
    .update(sourceText ?? '', 'utf8')
    .digest('hex')
  return {
    fileSha256,
    payload,
    warnings,
    outcome,
    extractorVersion: SCRIPT_EXTRACTOR_VERSION,
    schemaVersion: 1,
  }
}
