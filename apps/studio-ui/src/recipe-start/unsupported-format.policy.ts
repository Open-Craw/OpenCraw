/** File types the Studio cannot read yet, with what each one is called in plain words and what to do about it. */
const UNSUPPORTED: Record<string, { what: string, instead: string }> = {
  'odt':     { what: 'an OpenDocument text document', instead: 'Open it in Word or LibreOffice, save it as .docx or .pdf, and load that file.' },
  'odp':     { what: 'an OpenDocument presentation', instead: 'Open it in PowerPoint or LibreOffice, save it as .pptx or .pdf, and load that file.' },
  'rtf':     { what: 'a Rich Text document', instead: 'Open it in Word, save it as .docx or .pdf, and load that file.' },
  'pages':   { what: 'an Apple Pages document', instead: 'Export it from Pages as .pdf or .docx, and load that file.' },
  'numbers': { what: 'an Apple Numbers spreadsheet', instead: 'Export it from Numbers as .xlsx or .csv, and load that file.' },
  'key':     { what: 'an Apple Keynote presentation', instead: 'Export it from Keynote as .pptx or .pdf, and load that file.' },
  'zip':     { what: 'a compressed archive', instead: 'Unpack it and load the file you want from inside.' },
  'rar':     { what: 'a compressed archive', instead: 'Unpack it and load the file you want from inside.' },
  '7z':      { what: 'a compressed archive', instead: 'Unpack it and load the file you want from inside.' },
  'png':     { what: 'a picture', instead: 'The Studio reads text, tables and data, not pictures. If it is a scan, use the text version of the document.' },
  'jpg':     { what: 'a picture', instead: 'The Studio reads text, tables and data, not pictures. If it is a scan, use the text version of the document.' },
  'jpeg':    { what: 'a picture', instead: 'The Studio reads text, tables and data, not pictures. If it is a scan, use the text version of the document.' },
  'gif':     { what: 'a picture', instead: 'The Studio reads text, tables and data, not pictures.' },
}

/**
 * Says, in plain words, that a file type cannot be read yet and what to do instead: a message for the person to read
 * before anything is copied or opened, in place of a page of unreadable characters.
 *
 * @param name - A file name, or a path or address ending in one.
 * @returns The message, or `undefined` when the type is one the Studio reads (or one it does not know: then it tries).
 */
export function unsupportedFormatMessage (name: string): string | undefined {
  const extension = /\.([a-z0-9]+)$/i.exec(name.split(/[?#]/, 1)[0])?.[1]?.toLowerCase()
  const known = extension === undefined ? undefined : UNSUPPORTED[extension]
  if (known === undefined) return undefined
  const shown = name.split(/[\\/]/).pop() ?? name

  return `“${shown}” is ${known.what}, which the Studio cannot read yet. ${known.instead}`
}
