import type { HttpRequest, HttpResponseInit } from '@azure/functions'
import { callerAccess } from '../caller-access'
import type { HostSettings } from '../host-options'
import { problem, reply } from '../http-reply'
import { RecipeStoreError } from '../recipe-store'

/**
 * `POST /recipes/{name}/{version}/promote`: a draft becomes runnable in
 * production. Only for callers `canPromote` allows: an agent publishes, a
 * person promotes.
 *
 * @param request - The request.
 * @param settings - The host settings.
 * @returns The promoted version, 403, or the store's 404.
 */
export async function promoteRecipes (request: HttpRequest, settings: HostSettings): Promise<HttpResponseInit> {
  const access = callerAccess(request, settings)
  if (access === undefined || !settings.canPromote(access.caller)) return problem(403, 'this caller may not promote recipes')
  const { name = '', version = '' } = request.params
  if (settings.recipes === undefined) return problem(404, 'this host has no recipe store')
  try {
    await settings.recipes.promote(name, version)
  } catch (error) {
    return problem(error instanceof RecipeStoreError ? error.status : 500, error)
  }

  return reply(200, { name, version, state: 'promoted' })
}
