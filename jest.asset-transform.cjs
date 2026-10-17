// Written by smith convert: what @nx/react/plugins/jest did, without Nx.
// An imported SVG becomes a React component (named as SVGR names it), a JS or
// TS file goes to @swc/jest or babel-jest, and any other file is its name.
const path = require('node:path')

function className(name) {
  const camel = name
    .replace(/([^a-zA-Z0-9])+(.)?/g, (_, __, chr) => (chr ? chr.toUpperCase() : ''))
    .replace(/[^a-zA-Z\d]/g, '')
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

function jsTransformer(transforms) {
  const swc = (transforms ?? []).some((t) => Array.isArray(t) && t.some((v) => typeof v === 'string' && v.includes('@swc/jest')))
  if (swc) return require('@swc/jest').createTransformer()
  return require('babel-jest').default.createTransformer()
}

module.exports = {
  process(src, filename, options) {
    const assetFilename = JSON.stringify(path.basename(filename))
    if (filename.endsWith('.svg')) {
      const componentName = 'Svg' + className(path.parse(filename).name)
      return {
        code: `const React = require('react');
module.exports = {
  __esModule: true,
  default: ${assetFilename},
  ReactComponent: function ${componentName}(props) {
    return React.createElement('svg', Object.assign({}, props, { children: ${assetFilename} }));
  },
};`,
      }
    }
    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(path.extname(filename))) {
      return jsTransformer(options.config?.transform).process(src, filename, options)
    }
    return { code: `module.exports = ${assetFilename};` }
  },
}
