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

## Saludo personalizado

Opcionalmente, la web admite un nombre en la URL:

```text
?invitado=Laura%20Gomez
```

Esto personaliza el saludo; el formulario mantiene un máximo general de siete acompañantes.

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
