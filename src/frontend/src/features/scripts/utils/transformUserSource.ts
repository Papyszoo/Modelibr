/**
 * Rewrites a user module so it can run via `new Function` with `three` and
 * `three/tsl` injected: `import` lines become local bindings, and the default
 * export becomes the value we read back (`__result`). Best-effort — anything it
 * can't map surfaces as a normal runtime error in the guarded execution that
 * runs the transformed source.
 *
 * Kept as a standalone, dependency-free module so it can be unit-tested without
 * importing the (heavy, WebGPU) three.js entry points that the preview pulls in.
 */
export function transformUserSource(src: string): string {
  const moduleVar = (mod: string): string =>
    mod === 'three/tsl' ? '__TSL' : '__THREE'

  // Collapse multi-line imports (common with IDE auto-formatting) onto one line
  // so the line-based matcher below handles them too.
  const collapsed = src.replace(
    /import\s+(?:\*\s+as\s+\w+|\{[^}]*\}|\w+)\s+from\s+['"][^'"]+['"]/g,
    match => match.replace(/\s*\n\s*/g, ' ')
  )

  const importTransformed = collapsed
    .split('\n')
    .map(line => {
      let m = line.match(
        /^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/
      )
      if (m) return `const ${m[1]} = ${moduleVar(m[2])};`

      m = line.match(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/)
      if (m) return `const ${m[1]} = ${moduleVar(m[2])};`

      m = line.match(
        /^\s*import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/
      )
      if (m) {
        const names = m[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(n => n.replace(/\s+as\s+/, ': '))
          .join(', ')
        return `const { ${names} } = ${moduleVar(m[2])};`
      }

      // Drop imports we can't resolve offline; their symbols will error if used.
      if (/^\s*import\s+/.test(line)) return ''
      return line
    })
    .join('\n')

  const withResult = importTransformed.replace(
    /export\s+default\s+/,
    '__result = '
  )
  const withoutExports = withResult.replace(
    /(^|\n)\s*export\s+(const|let|var|function|class|async)\b/g,
    '$1$2'
  )
  return `let __result;\n${withoutExports}\n;return __result;`
}
