import { StepMemory } from './step-memory.store'

describe('StepMemory', () => {
  it('holds a step as it ran, and forgets the steps after one that ran again', () => {
    const memory = new StepMemory()
    memory.remember(1, 'axis')
    memory.remember(3, 'state=DL')
    memory.remember(4, 'rto=DL53')
    expect(memory.holds(1, 'axis')).toBe(true)
    expect(memory.holds(3, 'state=GA')).toBe(false)
    memory.remember(3, 'state=GA')
    // The RTO list reloaded with the new state: the RTO pick must run again.
    expect(memory.holds(4, 'rto=DL53')).toBe(false)
    expect(memory.holds(1, 'axis')).toBe(true)
    expect(memory.size).toBe(2)
    memory.forget()
    expect(memory.size).toBe(0)
  })
})
