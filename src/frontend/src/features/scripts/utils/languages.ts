import { cpp } from '@codemirror/lang-cpp'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { php } from '@codemirror/lang-php'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { StreamLanguage } from '@codemirror/language'
// CodeMirror 6 does not ship official packages for these languages, so we reuse
// the ported legacy (CodeMirror 5) StreamLanguage modes — fully offline. We use
// the `clike` factory directly for C# so we can give it a fuller keyword set;
// `shader` is a GLSL-aware mode used for .glsl/.hlsl/three.js shaders.
import {
  clike,
  shader as glslLegacy,
} from '@codemirror/legacy-modes/mode/clike'
import { lua as luaLegacy } from '@codemirror/legacy-modes/mode/lua'
import { ruby as rubyLegacy } from '@codemirror/legacy-modes/mode/ruby'
import { shell as shellLegacy } from '@codemirror/legacy-modes/mode/shell'
import { yaml as yamlLegacy } from '@codemirror/legacy-modes/mode/yaml'
import { type Extension } from '@codemirror/state'

/** Builds the `{ word: true }` keyword map the legacy clike factory expects. */
function words(str: string): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  for (const word of str.split(' ')) {
    if (word) map[word] = true
  }
  return map
}

// The stock legacy `csharp` mode ships a thin keyword set, so common modern C#
// (pattern matching, records, nullable, LINQ, file-scoped types) and the Unity
// API surface go unhighlighted. We rebuild it here with a fuller catalog. Note:
// `function` is not a C# keyword and is intentionally absent — method names are
// not specially highlighted by lightweight stream modes.
const csharpExtension: Extension = StreamLanguage.define(
  clike({
    name: 'csharp',
    keywords: words(
      'abstract as async await base break case catch checked class const continue' +
        ' default delegate do else enum event explicit extern finally fixed for' +
        ' foreach goto if implicit in init interface internal is lock namespace new' +
        ' operator out override params private protected public readonly record ref' +
        ' required return sealed sizeof stackalloc static struct switch this throw' +
        ' try typeof unchecked unsafe using virtual void volatile while add alias' +
        ' ascending descending dynamic from get global group into join let orderby' +
        ' partial remove select set value var yield' +
        // Modern C# (7–12) keywords the stock mode omits:
        ' when nameof where with and or not file scoped nint nuint unmanaged notnull managed'
    ),
    types: words(
      'Action Boolean Byte Char DateTime DateTimeOffset Decimal Double Func Guid' +
        ' Int16 Int32 Int64 Object SByte Single String Task TimeSpan UInt16 UInt32' +
        ' UInt64 bool byte char decimal double short int long object sbyte float' +
        ' string ushort uint ulong nint nuint' +
        // Common Unity types so MonoBehaviour scripts read well:
        ' Vector2 Vector3 Vector4 Quaternion Matrix4x4 Transform GameObject' +
        ' MonoBehaviour ScriptableObject Color Color32 Rigidbody Rigidbody2D' +
        ' Collider Collider2D Mathf Debug Input Time Coroutine IEnumerator' +
        ' Application GUI GUILayout Gizmos'
    ),
    blockKeywords: words(
      'catch class do else finally for foreach if struct switch try while'
    ),
    defKeywords: words('class interface namespace record struct'),
    typeFirstDefinitions: true,
    atoms: words('true false null'),
  })
)

/**
 * Maps a backend script language id (FileType.Value) to a CodeMirror language
 * extension. Falls back to no extension (plain text) for unknown ids so the
 * editor still loads. GDScript is Python-like, so it reuses the Python grammar;
 * GLSL/HLSL use the GLSL-aware legacy `shader` mode.
 */
export function getLanguageExtension(language: string): Extension[] {
  switch (language) {
    case 'javascript':
      return [javascript()]
    case 'typescript':
      return [javascript({ typescript: true })]
    case 'python':
    case 'gdscript':
      return [python()]
    case 'csharp':
      return [csharpExtension]
    case 'cpp':
      return [cpp()]
    case 'glsl':
    case 'hlsl':
      return [StreamLanguage.define(glslLegacy)]
    case 'lua':
      return [StreamLanguage.define(luaLegacy)]
    case 'java':
      return [java()]
    case 'rust':
      return [rust()]
    case 'ruby':
      return [StreamLanguage.define(rubyLegacy)]
    case 'php':
      return [php()]
    case 'shell':
      return [StreamLanguage.define(shellLegacy)]
    case 'sql':
      return [sql()]
    case 'json':
      return [json()]
    case 'yaml':
      return [StreamLanguage.define(yamlLegacy)]
    case 'xml':
      return [xml()]
    case 'html':
      return [html()]
    case 'css':
      return [css()]
    default:
      return []
  }
}

/** Human-readable label for a script language id, shown on the card badge. */
const LANGUAGE_LABELS: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  csharp: 'C#',
  cpp: 'C/C++',
  lua: 'Lua',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  shell: 'Shell',
  sql: 'SQL',
  json: 'JSON',
  yaml: 'YAML',
  xml: 'XML',
  glsl: 'GLSL',
  hlsl: 'HLSL',
  gdscript: 'GDScript',
}

export function getLanguageLabel(language: string): string {
  return LANGUAGE_LABELS[language] ?? language.toUpperCase()
}

/** Selectable languages for authoring a new script in-app (id + label). */
export const SCRIPT_LANGUAGES: { value: string; label: string }[] =
  Object.entries(LANGUAGE_LABELS)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))

/**
 * Kind of live preview a language supports:
 *  - 'shader' — GLSL/HLSL rendered as a GPU fragment shader (no JS execution).
 *  - 'scene'  — JS/TS that `export default`s a three.js material, rendered on a
 *    mesh. The user code runs once (guarded); the render loop is ours.
 */
export type PreviewKind = 'shader' | 'scene'

export function getPreviewKind(language: string): PreviewKind | null {
  if (language === 'glsl' || language === 'hlsl') return 'shader'
  if (language === 'javascript' || language === 'typescript') return 'scene'
  return null
}

export function isPreviewableLanguage(language: string): boolean {
  return getPreviewKind(language) !== null
}
