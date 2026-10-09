import { readCalloutTicket, signCalloutTicket } from './callout-ticket.algorithm'

const ticket = { instanceId: 'job-1', index: 2, key: 'abc123', expiresAt: 2_000_000 }

describe('signCalloutTicket and readCalloutTicket', () => {
  it('reads back the ticket it signed, while it has not expired', () => {
    const token = signCalloutTicket('secret', ticket)

    expect(readCalloutTicket('secret', token, 1_000_000)).toEqual({ ok: true, ticket })
  })

  it('makes a URL-safe token', () => {
    expect(signCalloutTicket('secret', ticket)).toMatch(/^[\w-]+\.[\w-]+$/)
  })

  it('refuses a token signed with another key', () => {
    const token = signCalloutTicket('secret', ticket)

    expect(readCalloutTicket('other', token, 1)).toEqual({ ok: false, reason: 'signature' })
  })

  it('refuses a token whose ticket was changed', () => {
    const [, given] = signCalloutTicket('secret', ticket).split('.', 2)
    const forged = Buffer.from(JSON.stringify({ ...ticket, instanceId: 'job-2' }), 'utf8').toString('base64url')

    expect(readCalloutTicket('secret', `${forged}.${given}`, 1)).toEqual({ ok: false, reason: 'signature' })
  })

  it('refuses an expired token', () => {
    const token = signCalloutTicket('secret', ticket)

    expect(readCalloutTicket('secret', token, 2_000_001)).toEqual({ ok: false, reason: 'expired' })
  })

  it('refuses what is not a token', () => {
    expect(readCalloutTicket('secret', '', 1)).toEqual({ ok: false, reason: 'malformed' })
    expect(readCalloutTicket('secret', 'a.b.c', 1)).toEqual({ ok: false, reason: 'malformed' })
    expect(readCalloutTicket('secret', 'nodots', 1)).toEqual({ ok: false, reason: 'malformed' })
  })
})
