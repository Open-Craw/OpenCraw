import { SAVE_CHOICES, defaultFileName, saveFilters, saveNameProblem } from './save-options.policy'

describe('save options', () => {
  it('offers every format the engine writes, one filter each, the spreadsheet first', () => {
    expect(SAVE_CHOICES.map(choice => choice.extension)).toEqual(['xlsx', 'csv', 'html', 'pdf', 'json', 'jsonl', 'yml'])
    expect(saveFilters()['Excel workbook (.xlsx)']).toEqual(['xlsx'])
    expect(Object.keys(saveFilters())).toHaveLength(7)
    expect(defaultFileName('vehicles')).toBe('vehicles.xlsx')
  })

  it('accepts a name whose extension is a format, in any case, and .yaml for YAML', () => {
    expect(saveNameProblem('/out/cars.CSV')).toBeUndefined()
    expect(saveNameProblem('/out/cars.yaml')).toBeUndefined()
    expect(saveNameProblem(String.raw`C:\out\cars.pdf`)).toBeUndefined()
  })

  it('explains a name that is not one, saying which extensions work', () => {
    expect(saveNameProblem('/out/cars.txt')).toMatch(/ends in "\.txt".*\.xlsx, \.csv, \.html, \.pdf, \.json, \.jsonl, \.yml/)
    expect(saveNameProblem('/out/cars')).toContain('has no extension')
  })
})
