import { getAppManifest, useState, useRuntimeConfig, useCookie } from '#imports'
import type { StudioUser } from 'nuxt-studio/app'

function getServiceToken(provider: string): string | null {
  if (provider === 'github') return process.env.STUDIO_GITHUB_TOKEN || null
  if (provider === 'gitlab') return process.env.STUDIO_GITLAB_TOKEN || null
  return null
}

export async function defineStudioActivationPlugin(onStudioActivation: (user: StudioUser) => Promise<void>) {
  const user = useState<StudioUser | null>('studio-session', () => null)
  const config = useRuntimeConfig().public.studio
  const cookie = useCookie('studio-session-check')

  if (config.dev) {
    return await onStudioActivation({
      provider: config.repository.provider || 'github',
      email: 'dev@nuxt.com',
      name: 'Dev',
      accessToken: '',
      providerId: '',
      avatar: '',
    })
  }

  // FPVirtual: Preguntar al servidor si hay sesión (incluyendo sesión de servicio con PAT)
  // En lugar de depender de process.env en el cliente, siempre hacemos fetch a la sesión.
  // El servidor (session.get.ts) devuelve una sesión de servicio cuando hay STUDIO_GITLAB_TOKEN.
  user.value = await $fetch<{ user: StudioUser }>('/__nuxt_studio/auth/session')
    .then(session => session?.user ?? null)
    .catch(() => null)

  // Si el servidor devolvió un usuario con accessToken (sesión real o de servicio PAT), activar Studio
  if (user.value?.accessToken) {
    // Disable prerendering for Studio
    const manifest = await getAppManifest()
    manifest.prerendered = []

    await onStudioActivation(user.value)
    return
  }

  let mounted = false
  if (user.value?.email) {
    // Disable prerendering for Studio
    const manifest = await getAppManifest()
    manifest.prerendered = []

    await onStudioActivation(user.value!)
    mounted = true
  }
  else if (mounted) {
    window.location.reload()
  }
  else {
    // Listen to CMD + . to toggle the studio or redirect to the login page
    document.addEventListener('keydown', (event) => {
      if (event.metaKey && event.key === '.') {
        setTimeout(() => {
          window.location.href = config.route + '?redirect=' + encodeURIComponent(window.location.pathname)
        })
      }
    })
  }
}
