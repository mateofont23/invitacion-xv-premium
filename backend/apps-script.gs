/**
 * Backend opcional para RSVP y recuerdos en Google Sheets y Google Drive.
 * 1) Crea una hoja de cálculo.
 * 2) Extensiones > Apps Script.
 * 3) Pega este código.
 * 4) Implementar > Nueva implementación > Aplicación web.
 * 5) Ejecutar como: tú. Acceso: cualquier persona.
 * 6) Copia la URL /exec y pégala en config.js -> appsScriptUrl.
 */

const SHEET_NAME = 'Confirmaciones';
const MEMORY_SHEET_NAME = 'Recuerdos';
const NOTIFY_EMAIL = 'diegoye27@hotmail.com';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    if (data.type === 'memory' || data.accion === 'recuerdo') return saveMemory(data);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const headers = [
      'Fecha', 'Invitado', 'Asiste', 'Acompañantes', 'Total asistentes',
      'Cupos', 'Mensaje', 'Origen', 'Apellido', 'Teléfono'
    ];
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    const total = data.asiste === 'Sí' ? 1 + Number(data.acompanantes || 0) : 0;
    sheet.appendRow([
      new Date(),
      `${data.nombre || ''} ${data.apellido || ''}`.trim(),
      data.asiste || '',
      Number(data.acompanantes || 0),
      total,
      8,
      data.observaciones || '',
      data.origen || '',
      data.apellido || '',
      data.telefono || ''
    ]);

    if (NOTIFY_EMAIL) {
      const subject = `Nueva confirmación XV: ${data.nombre || ''} ${data.apellido || ''}`;
      const body = [
        `Nombre: ${data.nombre || ''} ${data.apellido || ''}`,
        `Teléfono: ${data.telefono || ''}`,
        `Asiste: ${data.asiste || ''}`,
        `Acompañantes: ${data.acompanantes || 0}`,
        `Total asistentes: ${total}`,
        `Observaciones / alergias: ${data.observaciones || '—'}`
      ].join('\n');
      MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function saveMemory(data) {
  const message = String(data.mensaje || '').trim();
  const photo = data.photo || (data.foto ? {
    name: data.foto.nombre,
    mimeType: data.foto.tipo,
    base64: data.foto.contenido
  } : null);
  const video = data.video && data.video.base64 ? data.video : (data.video && data.video.contenido ? {
    name: data.video.nombre,
    mimeType: data.video.tipo,
    base64: data.video.contenido
  } : null);
  const requestId = String(data.requestId || '');

  if (!message && !photo && !video) throw new Error('El recuerdo debe incluir un mensaje, una foto o un video.');
  if (message.length > 3000) throw new Error('El mensaje puede tener máximo 3000 caracteres.');
  if (data.type === 'memory' && !requestId) throw new Error('Falta el identificador del recuerdo.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(MEMORY_SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(MEMORY_SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Fecha', 'Mensaje', 'Archivo foto', 'Archivo video', 'Origen', 'Request ID', 'Nombre']);
    } else {
      sheet.getRange(1, 6, 1, 2).setValues([['Request ID', 'Nombre']]);
    }

    if (requestId && sheet.getLastRow() > 1) {
      const requestIds = sheet.getRange(2, 6, sheet.getLastRow() - 1, 1).getDisplayValues().flat();
      if (requestIds.includes(requestId)) {
        return ContentService
          .createTextOutput(JSON.stringify({
            ok: true,
            duplicate: true,
            requestId: requestId,
            message: '¡Gracias! Tu recuerdo ha sido guardado.'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    const photoUrl = photo ? saveDriveFile(photo, 'photo') : '';
    const videoUrl = video ? saveDriveFile(video, 'video') : '';
    sheet.appendRow([
      data.submittedAt ? new Date(data.submittedAt) : new Date(),
      message,
      photoUrl,
      videoUrl,
      data.origen || '',
      requestId,
      'Anónimo'
    ]);

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail(
        NOTIFY_EMAIL,
        'Un nuevo recuerdo para los XV de Laura Sofía',
        `Se ha compartido un recuerdo anónimo.\nMensaje: ${message || 'Sin mensaje'}\n${photoUrl}\n${videoUrl}`
      );
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, duplicate: false, requestId: requestId }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function saveDriveFile(file, kind) {
  if (!file || !file.name || !file.mimeType || !file.base64) throw new Error('Archivo de recuerdo inválido.');

  const allowedTypes = kind === 'photo'
    ? ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    : ['video/mp4', 'video/webm', 'video/quicktime'];
  const maxBytes = kind === 'photo' ? 5 * 1024 * 1024 : 15 * 1024 * 1024;
  if (!allowedTypes.includes(file.mimeType)) throw new Error('Tipo de archivo de recuerdo no permitido.');

  const bytes = Utilities.base64Decode(file.base64);
  if (bytes.length > maxBytes) throw new Error(kind === 'photo' ? 'La foto debe pesar máximo 5 MB.' : 'El video debe pesar máximo 15 MB.');
  const propertyName = kind === 'photo' ? 'MEMORY_PHOTO_FOLDER_ID' : 'MEMORY_VIDEO_FOLDER_ID';
  const folderId = PropertiesService.getScriptProperties().getProperty(propertyName);
  if (!folderId) throw new Error(`Falta la propiedad de Apps Script ${propertyName}.`);
  const blob = Utilities.newBlob(bytes, file.mimeType, file.name);
  return DriveApp.getFolderById(folderId).createFile(blob).getUrl();
}
