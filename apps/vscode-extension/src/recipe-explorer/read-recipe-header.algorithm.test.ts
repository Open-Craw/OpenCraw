import { readRecipeHeader } from './read-recipe-header.algorithm'

describe('readRecipeHeader', () => {
  it('recognises an output recipe and an input recipe with the output it feeds', () => {
    expect(readRecipeHeader('/w/cars.ocw-out.json', '{"kind":"output","id":"cars","version":1,"fields":{}}')).toEqual({ file: '/w/cars.ocw-out.json', kind: 'output', id: 'cars' })
    expect(readRecipeHeader('/w/kia.ocw-in.json', '{"kind":"input","id":"kia","output":"cars","steps":[]}')).toEqual({ file: '/w/kia.ocw-in.json', kind: 'input', id: 'kia', output: 'cars' })
  })

  it('leaves out what is not a recipe: other JSON, text that is not JSON, a recipe with no id', () => {
    expect(readRecipeHeader('/w/package.json', '{"name":"x","version":"1.0.0"}')).toBeUndefined()
    expect(readRecipeHeader('/w/notes.json', 'not json')).toBeUndefined()
    expect(readRecipeHeader('/w/list.json', '[1,2]')).toBeUndefined()
    expect(readRecipeHeader('/w/a.ocw-in.json', '{"kind":"input","output":"cars"}')).toBeUndefined()
    expect(readRecipeHeader('/w/a.ocw-in.json', '{"kind":"input","id":""}')).toBeUndefined()
  })

  it('reads an input that names no output as an input with none', () => {
    expect(readRecipeHeader('/w/a.ocw-in.json', '{"kind":"input","id":"a"}')).toEqual({ file: '/w/a.ocw-in.json', kind: 'input', id: 'a' })
  })
})
