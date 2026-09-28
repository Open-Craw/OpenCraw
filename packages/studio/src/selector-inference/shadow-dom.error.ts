/**
 * Thrown when a pick or a list-inference walk crosses a declarative shadow
 * root (`<template shadowrootmode>`). v1 does not pierce shadow DOM: rather
 * than infer a selector that silently matches the wrong thing (or nothing,
 * once the page hydrates), the studio surfaces this and stops.
 */
export class ShadowDomUnsupportedError extends Error {
  constructor (readonly path: string) {
    super(`"${path}" is inside a shadow root: shadow DOM is not supported for picking (v1)`)
    this.name = 'ShadowDomUnsupportedError'
  }
}
