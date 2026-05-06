import { eventHandler, useSession, deleteCookie, getRequestProtocol, setCookie } from 'h3'
import { useRuntimeConfig } from '#imports'

function getServiceToken(provider: string): string | null {
  if (provider === 'github') return process.env.STUDIO_GITHUB_TOKEN || null
  if (provider === 'gitlab') return process.env.STUDIO_GITLAB_TOKEN || null
  return null
}

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event).studio
  const session = await useSession(event, {
    name: 'studio-session',
    password: config?.auth?.sessionSecret,
    cookie: {
      // Use secure cookies over HTTPS, required for locally testing purposes
      secure: getRequestProtocol(event) === 'https',
      path: '/',
    },
  })

  // FPVirtual: Si no hay sesión pero hay PAT de servicio, devolver sesión de servicio
  if (!session.data?.user) {
    const serviceToken = getServiceToken(config?.repository?.provider)
    if (serviceToken) {
      // Set session-check cookie so client knows session is active
      setCookie(event, 'studio-session-check', 'true', {
        httpOnly: false,
        path: '/',
        secure: getRequestProtocol(event) === 'https',
        sameSite: 'lax',
      })

      return {
        user: {
          provider: config.repository.provider,
          email: 'service@studio.local',
          name: 'Studio Service',
          accessToken: serviceToken,
          providerId: 'service',
          avatar: '',
        },
        id: 'service-session',
      }
    }

    // Delete the cookie to indicate that the session is inactive
    deleteCookie(event, 'studio-session-check', { path: '/' })
  }

  return {
    ...session.data,
    id: session.id!,
  }
})
