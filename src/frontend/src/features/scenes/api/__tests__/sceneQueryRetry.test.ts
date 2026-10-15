import { ApiClientError } from '@/lib/apiBase'

import { getSceneByIdQueryOptions, getSceneSlotsQueryOptions } from '../queries'

const notFound = () =>
  new ApiClientError('Scene no longer exists', {
    status: 404,
    isNetworkError: false,
    isTimeout: false,
    isOffline: false,
  })

const transient = () => new Error('Network down')

/*
  Regression: a scene deleted while its tab was open answered 404, and React
  Query retried it and refetched it on every window focus - a stream of 404s
  for a scene that is never coming back.
*/
describe('scene queries stop on a deleted scene (404)', () => {
  it('does not retry a 404 but retries other failures', () => {
    const options = getSceneByIdQueryOptions(1)
    const retry = options.retry as (count: number, error: unknown) => boolean

    expect(retry(0, notFound())).toBe(false)
    expect(retry(0, transient())).toBe(true)
  })

  it('does not refetch a 404 scene on window focus', () => {
    const options = getSceneByIdQueryOptions(1)
    const onFocus = options.refetchOnWindowFocus as (query: {
      state: { error: unknown }
    }) => boolean

    expect(onFocus({ state: { error: notFound() } })).toBe(false)
    expect(onFocus({ state: { error: transient() } })).toBe(true)
  })

  it('applies the same 404 guard to the slots query', () => {
    const options = getSceneSlotsQueryOptions(1)
    const retry = options.retry as (count: number, error: unknown) => boolean

    expect(retry(0, notFound())).toBe(false)
    expect(retry(0, transient())).toBe(true)
  })
})
