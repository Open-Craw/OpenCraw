import { bootstrapStepsFor, gotoCardNode, recipeStartUrl, suggestedBootstrap, suggestedStorageStatePath } from './recording-conversion.mapper'

describe('gotoCardNode', () => {
  it('builds a goto card back to the recording\'s own start point', () => {
    const node = gotoCardNode('http://127.0.0.1:4599/login', 'steps.0')
    expect(node.kind).toBe('card')
    expect(node.step).toEqual({ type: 'goto', url: 'http://127.0.0.1:4599/login' })
  })
})

describe('bootstrapStepsFor', () => {
  it('restores the start point with a goto, then every step recorded, in order', () => {
    const fillUser = { type: 'fill', selector: '#user', value: 'alice' }
    const fillPass = { type: 'fill', selector: '#pass', value: '{{env.PASS}}' }
    const clickSubmit = { type: 'click', selector: '#submit' }
    expect(bootstrapStepsFor('http://127.0.0.1:4599/login', [fillUser, fillPass, clickSubmit])).toEqual([
      { type: 'goto', url: 'http://127.0.0.1:4599/login' },
      fillUser,
      fillPass,
      clickSubmit,
    ])
  })
})

describe('suggestedBootstrap', () => {
  it('carries keep: ["cookies"] and the suggested saveTo, matching recording.e2e.test.ts\'s golden recipe', () => {
    const fillUser = { type: 'fill', selector: '#user', value: 'alice' }
    const bootstrap = suggestedBootstrap('http://127.0.0.1:4599/login', [fillUser], undefined, '/folder/storage/login-session.json')
    expect(bootstrap).toEqual({
      steps:  [{ type: 'goto', url: 'http://127.0.0.1:4599/login' }, fillUser],
      keep:   ['cookies'],
      saveTo: '/folder/storage/login-session.json',
    })
  })

  it('keeps any other field the recipe\'s own bootstrap already had', () => {
    const bootstrap = suggestedBootstrap('http://x/', [], { hook: 'custom-consent' }, '/x/storage/login-session.json')
    expect(bootstrap).toMatchObject({ hook: 'custom-consent', keep: ['cookies'] })
  })
})

describe('recipeStartUrl', () => {
  it('reads the first start point\'s url', () => {
    expect(recipeStartUrl({ start: [{ url: 'http://127.0.0.1:4599/login' }] })).toBe('http://127.0.0.1:4599/login')
  })

  it('returns undefined when start is missing, empty, or shaped unexpectedly', () => {
    expect(recipeStartUrl({})).toBeUndefined()
    expect(recipeStartUrl({ start: [] })).toBeUndefined()
    expect(recipeStartUrl({ start: 'not an array' })).toBeUndefined()
    expect(recipeStartUrl({ start: [{ vars: {} }] })).toBeUndefined()
  })
})

describe('suggestedStorageStatePath', () => {
  it('suggests storage/<id>-session.json next to the recipe file', () => {
    expect(suggestedStorageStatePath('/folder/login.input.json', 'login')).toBe('/folder/storage/login-session.json')
  })

  it('handles a recipe file with no directory', () => {
    expect(suggestedStorageStatePath('login.input.json', 'login')).toBe('./storage/login-session.json')
  })
})
