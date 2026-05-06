import { createSharedComposable } from './createSharedComposable'
import type { GitOptions, GitProviderAPI, GitProviderType } from '../types'
import { createGitHubProvider, createGitLabProvider, createNullProvider } from '../utils/providers'

function getProviderIcon(provider: GitProviderType | null): string {
  switch (provider) {
    case 'github':
      return 'i-simple-icons:github'
    case 'gitlab':
      return 'i-simple-icons:gitlab'
    default:
      return 'i-simple-icons:git'
  }
}

function getProviderName(provider: GitProviderType | null): string {
  switch (provider) {
    case 'github':
      return 'GitHub'
    case 'gitlab':
      return 'GitLab'
    default:
      return 'Local'
  }
}

function createProvider(provider: GitProviderType | null, options: GitOptions): GitProviderAPI {
  switch (provider) {
    case 'gitlab':
      return createGitLabProvider(options)
    case 'github':
      return createGitHubProvider(options)
    default:
      return createNullProvider(options)
  }
}

export const useGitProvider = createSharedComposable((options: GitOptions, devMode: boolean = false) => {
  const provider = devMode ? null : options.provider
  let currentApi = createProvider(provider, options)

  // Proxy que delega siempre al provider actual
  // Esto permite cambiar de branch en caliente sin que los consumidores noten la diferencia
  const api = new Proxy({} as GitProviderAPI, {
    get(_, prop) {
      const value = (currentApi as any)[prop]
      if (typeof value === 'function') {
        return value.bind(currentApi)
      }
      return value
    },
  })

  function setBranch(branch: string) {
    options.branch = branch
    currentApi = createProvider(provider, options)
  }

  return {
    name: getProviderName(provider),
    icon: getProviderIcon(provider),
    api,
    setBranch,
  }
})
