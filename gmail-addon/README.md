# Phish Alert — Add-on de Gmail

Panel lateral en Gmail (como el de KnowBe4) con un botón "Reportar como Phishing"
que envía el correo abierto al backend de Centinela (`POST /api/pab/addon-report`).
Reutiliza la misma tabla `pab_reports` y la misma lógica de detección de campañas
simuladas que el Phish Alert Button dentro de la app.

**Esta carpeta contiene el código.** El despliegue a toda la organización requiere
pasos en Google Workspace Admin y en Cloudflare Zero Trust que **solo puede hacer
alguien con acceso de administrador** a esas consolas — no se puede hacer desde aquí.

## 1. Preparar el backend (una sola vez)

1. En el `.env` de producción, defina `PAB_ADDON_API_KEY` con un valor aleatorio largo:
   ```bash
   openssl rand -hex 32
   ```
2. Reinicie el backend para que tome la variable nueva.
3. **Cloudflare Zero Trust — permitir esta ruta sin login interactivo.** Apps Script
   llama a la API desde un servidor de Google, sin una sesión de navegador, así que
   Cloudflare Access (que hoy exige login corporativo para *todo* `elearning.agroamerica.com`)
   bloquearía la llamada antes de que llegue al backend. Hay que agregar una regla
   que deje pasar únicamente esta ruta:
   - Zero Trust dashboard → **Access → Applications** → abra la aplicación de
     `elearning.agroamerica.com`.
   - **Add a policy** (o edite las existentes) con una regla adicional tipo
     **Bypass** cuyo *Path* sea exactamente `/api/pab/addon-report` (o cree una
     "Application" nueva más específica solo para esa ruta, con política Bypass).
   - Esta ruta queda protegida únicamente por `PAB_ADDON_API_KEY` (que solo conoce
     el Add-on), no por Cloudflare Access — es del mismo tipo de exposición
     controlada que ya usan `/api/phish/track` y `/api/phish/open` hoy.

## 2. Crear el proyecto de Apps Script

1. Vaya a [script.google.com](https://script.google.com) con una cuenta de
   Google Workspace de AgroAmérica (idealmente una cuenta de servicio de TI, no
   una persona individual, para que el add-on no dependa de una sola persona).
2. **Proyecto nuevo** → bórrele el `Code.gs` de ejemplo y pegue el contenido de
   [`Code.gs`](Code.gs) de esta carpeta.
3. En el editor: ⚙️ **Configuración del proyecto** → active "Mostrar archivo de
   manifiesto `appsscript.json` en el editor".
4. Reemplace el contenido de `appsscript.json` con el de [`appsscript.json`](appsscript.json)
   de esta carpeta. Si su dominio público no es `elearning.agroamerica.com`,
   actualice `urlFetchWhitelist` ahí **y** la constante `API_BASE` en `Code.gs`.
5. ⚙️ **Configuración del proyecto → Propiedades del script → Agregar propiedad
   del script**: clave `PAB_ADDON_API_KEY`, valor = el mismo que puso en el
   `.env` del backend en el paso 1.

## 3. Publicar el add-on internamente (sin pasar por el Marketplace público)

1. En el editor de Apps Script: **Implementar → Nueva implementación**.
2. Tipo: **Complemento de Google Workspace**.
3. Complete nombre/descripción y guarde. Apps Script generará un ID de
   implementación (`deployment ID`).
4. **Instalación en toda la organización** (requiere admin de Google Workspace):
   - Vaya a [admin.google.com](https://admin.google.com) → **Apps → Google
     Workspace Marketplace apps → Configurar apps de usuario → Implementar app**
     → **Implementar app privada personalizada** (o "Deploy add-on" según la
     versión de la consola).
   - Pegue el **ID de implementación** del paso 3.
   - Asigne la instalación a la unidad organizativa que corresponda (ej. todos
     los usuarios, o un grupo piloto primero).
5. En unos minutos, a los usuarios asignados les aparecerá el ícono de "Phish
   Alert" en la barra lateral derecha de Gmail al abrir cualquier correo.

## 4. Probar

1. Abra cualquier correo en Gmail con una cuenta incluida en la instalación.
2. Debe aparecer el panel "Phish Alert" en la barra lateral derecha.
3. Clic en **Reportar como Phishing** → debe mostrar una notificación de
   confirmación ("Gracias por reportar..." o "¡Excelente! Usted reportó...").
4. Verifique en la app: **Usuarios → (ese usuario)** o en la tabla `pab_reports`
   que se registró el reporte.

## Notas

- El correo que reporta el usuario se empareja contra `users.email` (ya
  sincronizado desde AD) — si el usuario no existe todavía en Centinela, el
  backend responde 404 y el add-on muestra un mensaje de error.
- Si más adelante quiere publicarlo también fuera de su organización (Google
  Workspace Marketplace público), Google exige una revisión de seguridad del
  add-on (OAuth verification) — no es necesario para uso interno.
- Rotar `PAB_ADDON_API_KEY`: cámbielo en el `.env` del backend y en las Script
  Properties del proyecto de Apps Script al mismo tiempo.
