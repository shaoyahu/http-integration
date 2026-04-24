import { describe, expect, it } from 'vitest'
import { setNestedValue } from './requestPayload'

describe('requestPayload helpers', () => {
  it('should replace primitive intermediate values when writing nested paths', () => {
    const target: Record<string, unknown> = {
      user: 'stale',
    }

    setNestedValue(target, 'user.profile.name', 'alice')

    expect(target).toEqual({
      user: {
        profile: {
          name: 'alice',
        },
      },
    })
  })

  it('should preserve existing nested objects when appending sibling values', () => {
    const target: Record<string, unknown> = {
      user: {
        profile: {
          name: 'alice',
        },
      },
    }

    setNestedValue(target, 'user.profile.id', 1)

    expect(target).toEqual({
      user: {
        profile: {
          name: 'alice',
          id: 1,
        },
      },
    })
  })
})
