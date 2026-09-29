import { buildRecordsExportFile, recordsToCsv, recordsToJson, recordsToJsonl } from './records-export.mapper'
import type { PreviewRecord } from './records-table.component'

const RECORDS: PreviewRecord[] = [
  { key: 'a1', data: { name: 'Widget', price: 9.5, tags: ['a', 'b'] } },
  { key: 'a2', data: { name: 'Gadget, "Pro"' } },
]

describe('records-export.mapper', () => {
  it('recordsToJson: a pretty-printed array of each record\'s data, key/scope/mapping left out', () => {
    expect(recordsToJson(RECORDS)).toBe(JSON.stringify([RECORDS[0]?.data, RECORDS[1]?.data], null, 2))
  })

  it('recordsToJson: an empty array for no records', () => {
    expect(recordsToJson([])).toBe('[]')
  })

  it('recordsToJsonl: one compact JSON object per line, trailing newline', () => {
    expect(recordsToJsonl(RECORDS)).toBe('{"name":"Widget","price":9.5,"tags":["a","b"]}\n{"name":"Gadget, \\"Pro\\""}\n')
  })

  it('recordsToJsonl: empty content for no records', () => {
    expect(recordsToJsonl([])).toBe('')
  })

  it('recordsToCsv: a header from every field seen, missing cells blank, nested values stringified and quoted', () => {
    expect(recordsToCsv(RECORDS)).toBe(
      'name,price,tags\r\n' +
      'Widget,9.5,"[""a"",""b""]"\r\n' +
      '"Gadget, ""Pro""",,\r\n',
    )
  })

  it('recordsToCsv: empty content for no records', () => {
    expect(recordsToCsv([])).toBe('')
  })

  it('buildRecordsExportFile: names, types and builds each format, with a custom base name', () => {
    expect(buildRecordsExportFile(RECORDS, 'json')).toEqual({ filename: 'records.json', mimeType: 'application/json', content: recordsToJson(RECORDS) })
    expect(buildRecordsExportFile(RECORDS, 'jsonl')).toEqual({ filename: 'records.jsonl', mimeType: 'application/x-ndjson', content: recordsToJsonl(RECORDS) })
    expect(buildRecordsExportFile(RECORDS, 'csv', 'books')).toEqual({ filename: 'books.csv', mimeType: 'text/csv', content: recordsToCsv(RECORDS) })
  })
})
