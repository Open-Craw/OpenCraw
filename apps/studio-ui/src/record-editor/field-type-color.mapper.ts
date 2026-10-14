const TYPE_COLORS: Record<string, string> = {
  string:   'gray',
  number:   'blue',
  integer:  'blue',
  boolean:  'green',
  date:     'purple',
  datetime: 'purple',
  currency: 'orange',
  url:      'cyan',
  enum:     'pink',
  array:    'teal',
  object:   'teal',
  json:     'yellow',
}

/**
 * The colour palette a field type's badge is drawn with, so a record's shape
 * reads at a glance: text grey, numbers blue, dates purple, links cyan.
 *
 * @param type - A field type.
 * @returns A Chakra colour palette name; grey for an unknown type.
 */
export function typeColor (type: string): string {
  return TYPE_COLORS[type] ?? 'gray'
}
