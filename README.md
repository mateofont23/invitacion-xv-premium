# Invitación XV · Premium Mobile

Prototipo mobile-first de invitación digital de quince años.

## Archivos

- `index.html`: estructura de la invitación.
- `styles.css`: estilo visual y animaciones.
- `config.js`: nombre, fecha, lugar, mapa, RSVP y WhatsApp.
- `app.js`: cuenta regresiva, animaciones y formularios RSVP/recuerdos.
- `assets/vestido-referencia.jpeg`: referencia visual enviada por el cliente.
- `backend/apps-script.gs`: backend opcional para Google Sheets + correo.

## Probar localmente

Puedes abrir `index.html` directamente, o levantar un servidor local:

```bash
python -m http.server 8080
```

Luego abre `http://localhost:8080`.

## Invitaciones personalizadas

Los enlaces individuales reciben el código mediante `?i=`. El código se normaliza con `trim().toUpperCase()` y se consulta al endpoint de `config.js` por POST, con `Content-Type: text/plain;charset=utf-8`, `redirect: follow` y este cuerpo:

```json
{ "type": "invite", "action": "lookup", "inviteCode": "CODIGO_INDIVIDUAL" }
```

Una respuesta con `ok: true` y `valid: true` permite mostrar el nombre de referencia y limita los acompañantes a `0…maxCompanions`. El nombre y apellido del formulario siguen siendo editables. El RSVP conserva sus campos, `requestId` y reintentos, y agrega `inviteCode` cuando la invitación está validada. Los datos de la invitación permanecen solo en memoria.

Con código inválido, vacío o pendiente de validar se bloquea únicamente el RSVP. Un fallo de consulta muestra un mensaje y permite reintentar. Una respuesta ya registrada se indica sin impedir actualizaciones. El backend conserva la validación definitiva del cupo.

Sin `?i=` no se consulta la invitación ni se muestra un nombre personalizado; se mantiene temporalmente el RSVP público de hasta siete acompañantes, mientras el backend tenga `invitationControlEnforced: false`. El antiguo parámetro `invitado` deja de personalizar la página.

El endpoint desplegado debe aceptar la consulta anterior. El archivo opcional `backend/apps-script.gs` de esta carpeta no contiene ese sistema; no reemplaces con él el backend actual.

## Publicación recomendada

### Opción inicial: GitHub Pages

Ideal para mostrar el prototipo al cliente porque esta web es estática y no requiere servidor propio.

1. Crear repositorio en GitHub.
2. Subir estos archivos a la rama `main`.
3. Settings > Pages.
4. Deploy from a branch > `main` > `/root`.
5. GitHub entregará una URL pública.

### Para producción

Se puede conservar GitHub como repositorio y usar un dominio personalizado. El RSVP funciona desde una web estática porque envía los datos al Web App de Google Apps Script.

## Conectar RSVP con Google Sheets

Revisa `backend/apps-script.gs`. `setupMemories()` configura internamente las Script Properties `MEMORY_ROOT_FOLDER_ID`, `MEMORY_PHOTO_FOLDER_ID` y `MEMORY_VIDEO_FOLDER_ID`; los IDs de Drive no se exponen al frontend. Autoriza los permisos de Sheets, Drive y correo al implementar. El script incluye notificaciones a `diegoye27@hotmail.com`. Después de publicar Apps Script como aplicación web, pega la URL `/exec` en:

```js
appsScriptUrl: "https://script.google.com/macros/s/.../exec"
```

## Pendiente de definición

- Enlace de Google Maps.
- Código de vestuario.
- Fotos definitivas.
- Música para la invitación y la futura experiencia privada de recuerdos.
