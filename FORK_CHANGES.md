# Cambios en el Fork — FPVirtual Nuxt Studio

> **Repo original:** `nuxt-content/nuxt-studio` (MIT License)  
> **Fork:** `fpvirtual-nuxt-studio`  
> **Rama:** `feat/multi-branch`  
> **Propósito:** Permitir branch dinámico por usuario para edición multi-usuario vía iframe.

---

## Resumen de cambios

Se han modificado **6 archivos** para hacer el branch reactivo y soportar comunicación `postMessage` desde la app padre.

---

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

### 7. `src/app/vite.config.ts`

- Desactivado `vite-plugin-dts` para evitar errores de tipo del upstream durante el build local.

**Nota:** Esto no afecta el runtime. Solo evita que `vue-tsc` falle con errores de `$t` (i18n) y versiones incompatibles de `@tiptap/vue-3` en el build de producción del fork.

---

## Flujo de comunicación (App Padre ↔ Studio)

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

Todos los demás archivos del fork permanecen intactos: plugins, rutas de servidor, AI, media manager, editor TipTap, Monaco, service worker, etc.

---

## Compatibilidad upstream

- No se han eliminado funciones ni interfaces existentes.
- Solo se han añadido métodos/propiedades nuevas (`setBranch`, `overrideBranch`).
- El comportamiento por defecto (sin recibir `postMessage`) es idéntico al upstream: usa el branch configurado en `nuxt.config.ts`.
