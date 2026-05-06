# Cambios en el Fork — FPVirtual Nuxt Studio

> **Repo original:** `nuxt-content/nuxt-studio` (MIT License)  
> **Fork:** `fpvirtual-nuxt-studio`  
> **Rama:** `feat/multi-branch`  
> **Propósito:** Permitir branch dinámico por usuario para edición multi-usuario vía iframe, usando PAT de servicio sin requerir OAuth.

---

## Resumen de cambios

Se han modificado **9 archivos** en tres categorías:
1. **Branch dinámico** (6 archivos) — postMessage + proxy pattern
2. **Autenticación PAT** (3 archivos) — modo facade sin OAuth

---

## Parte 1: Branch Dinámico (postMessage)

### 1. `src/app/src/types/git.ts`

- Añadido `setBranch(branch: string)` a la interfaz `GitProviderAPI`.
- Añadido parámetro opcional `overrideBranch?: string` a `fetchFile` y `commitFiles`.

**Motivo:** Contrato unificado para que todos los providers (GitLab, GitHub, Null) permitan cambio de branch en runtime.

---

### 2. `src/app/src/utils/providers/gitlab.ts`

- `const branch` → `let branch` (mutable en closure).
- Añadida función `setBranch(newBranch)` que actualiza la variable interna.
- Añadido `overrideBranch` opcional en `fetchFile` y `commitFiles`.
- Las funciones usan `targetBranch = overrideBranch || branch`.

**Motivo:** El branch ya no está cerrado en el closure al crear el provider. Puede mutar cuando el admin cambie de usuario en la app padre.

---

### 3. `src/app/src/utils/providers/github.ts`

- Cambios análogos a `gitlab.ts`.

**Motivo:** Consistencia entre providers. Si en el futuro se usa GitHub, el comportamiento es idéntico.

---

### 4. `src/app/src/utils/providers/null.ts`

- Añadido `setBranch: () => {}` para cumplir el tipo `GitProviderAPI`.

---

### 5. `src/app/src/composables/useGitProvider.ts` — **Cambio arquitectónico clave**

- El objeto `api` devuelto ahora es un **`Proxy`** que delega dinámicamente al provider actual.
- Añadido método `setBranch(branch)` que:
  1. Actualiza `options.branch`
  2. **Recrea el provider completamente** via `createProvider()`

**Motivo:** Los consumidores (`useDraftDocuments`, `useDraftMedias`, `useTree`, etc.) usan `gitProvider.api.fetchFile(...)` directamente. Si `api` fuera una `ref` de Vue, todos los consumidores tendrían que usar `.value`, rompiendo el código upstream. El `Proxy` es transparente: los consumidores no notan que el provider subyacente ha cambiado.

**Beneficio adicional:** Al recrear el provider, el cache interno `gitFiles` (closure variable) se reinicia automáticamente, evitando que se sirvan archivos cacheados del branch anterior.

---

### 6. `src/app/src/composables/useStudio.ts` — **Comunicación iframe**

- `gitOptions` convertido a **`reactive`** (Vue) para permitir mutación del branch.
- Al inicializar, lee `localStorage.getItem('studio-user-branch')` como branch inicial (fallback al branch del repo).
- Añadido listener `window.addEventListener('message', ...)` que:
  - Valida `event.origin` contra whitelist configurable (`window.__STUDIO_ALLOWED_ORIGINS__` o `[window.location.origin]`)
  - Reacciona a mensajes `{ type: 'studio:set-branch', branch: 'user-xxx' }`
  - Persiste el nuevo branch en `localStorage`
  - Actualiza `gitOptions.branch`
  - Llama a `gitProvider.setBranch(newBranch)`
  - Si Studio ya está montado (`isReady`), recarga `draftDocuments` y `draftMedias`

**Motivo:** Implementa el flujo de comunicación App Padre ↔ Studio vía iframe especificado en la arquitectura del proyecto (DA-4).

---

## Parte 2: Autenticación PAT (modo facade)

### 7. `src/module/src/runtime/utils/activation.ts`

**Cambio:** Añadida detección de PAT de servicio antes de requerir sesión OAuth.

```ts
const serviceToken = getServiceToken(config.repository.provider)
if (serviceToken) {
  // Activar Studio directamente con el PAT, sin OAuth
  await onStudioActivation({
    provider: config.repository.provider,
    email: 'service@studio.local',
    name: 'Studio Service',
    accessToken: serviceToken,
    providerId: 'service',
    avatar: '',
  })
  return
}
```

**Motivo:** Según DA-2, se usa un único GitLab PAT con scope `api` en variables de entorno del servidor. Los usuarios no necesitan cuenta en GitLab. El token nunca viaja al cliente explícitamente; el servidor lo inyecta en la sesión de Studio.

---

### 8. `src/module/src/runtime/server/routes/auth/session.get.ts`

**Cambio:** Si no hay sesión activa pero hay `STUDIO_GITLAB_TOKEN` (o `STUDIO_GITHUB_TOKEN`), devuelve una sesión de servicio válida con el PAT.

```ts
if (!session.data?.user) {
  const serviceToken = getServiceToken(config?.repository?.provider)
  if (serviceToken) {
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
}
```

**Motivo:** El cliente de Studio hace polling a `/__nuxt_studio/auth/session` para verificar autenticación. Con este cambio, el cliente recibe siempre una sesión válida cuando hay PAT configurado, sin necesidad de pasar por OAuth.

---

### 9. `src/module/src/runtime/server/routes/admin.ts`

**Cambio:** Si hay PAT de servicio configurado, redirige a la app principal en lugar de forzar OAuth.

```ts
const hasServiceToken = process.env.STUDIO_GITHUB_TOKEN || process.env.STUDIO_GITLAB_TOKEN
if (hasServiceToken) {
  const redirectUrl = redirect && String(redirect).startsWith('/') ? String(redirect) : '/'
  return sendRedirect(event, redirectUrl)
}
```

**Motivo:** La ruta `/_studio` originalmente mostraba una página de login OAuth. Ahora, si hay PAT, redirige a la página de contenido donde Studio se activa automáticamente via el plugin cliente.

---

## Flujo completo (App Padre ↔ Studio)

### Autenticación (PAT)
```
Servidor (Nitro)
├── Lee STUDIO_GITLAB_TOKEN del .env
├── activation.ts: detecta PAT → activa Studio sin OAuth
├── session.get.ts: devuelve sesión de servicio con PAT
└── admin.ts: redirige a app principal si hay PAT

Cliente (Vue)
├── Plugin studio.client.ts carga en cada página
├── activation.ts detecta PAT → llama onStudioActivation()
└── useStudio.ts recibe accessToken = PAT via host.user.get()
```

### Cambio de branch (postMessage)
```
App Padre (Nuxt)
├── Admin selecciona usuario en sidebar
├── Obtiene branch = "user-{uuid}"
├── Guarda en localStorage: studio-user-branch = "user-{uuid}"
└── Envía postMessage al iframe:
    { type: 'studio:set-branch', branch: 'user-{uuid}' }

Studio (dentro de iframe /_studio)
├── Escucha message event
├── Valida e.origin
├── Actualiza gitOptions.branch
├── Recrea gitProvider (nuevo branch, cache limpio)
└── Recarga drafts y árboles de contenido
```

---

## Archivos NO modificados (conservados del upstream)

Todos los demás archivos del fork permanecen intactos: plugins, rutas de servidor (meta, medias, AI), editor TipTap, Monaco, service worker, etc.

---

## Compatibilidad upstream

- No se han eliminado funciones ni interfaces existentes.
- Solo se han añadido métodos/propiedades nuevas (`setBranch`, `overrideBranch`).
- El comportamiento por defecto (sin PAT, sin postMessage) es idéntico al upstream: requiere OAuth y usa el branch configurado en `nuxt.config.ts`.

---

## Build

```bash
cd /home/darioaxel/Proyectos/fpvirtual-nuxt-studio
pnpm prepack
```
