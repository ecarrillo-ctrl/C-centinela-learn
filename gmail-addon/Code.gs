/**
 * Phish Alert — Gmail Add-on para eLearning AgroAmérica (Centinela)
 *
 * Muestra un panel lateral en Gmail con un botón "Reportar como Phishing"
 * para el correo que el usuario tiene abierto. Al presionarlo, envía el
 * asunto y remitente al backend de Centinela (POST /api/pab/addon-report),
 * que identifica al usuario por su correo de Gmail y registra el reporte
 * en la misma tabla que usa el Phish Alert Button dentro de la app.
 */

// URL pública de la app (Cloudflare Tunnel). Cambiar si el dominio cambia.
var API_BASE = 'https://elearning.agroamerica.com';

/**
 * Punto de entrada del contextual trigger: se ejecuta cada vez que el
 * usuario abre un correo en Gmail.
 */
function buildAddOn(e) {
  var accessToken = e.gmail.accessToken;
  var messageId = e.gmail.messageId;
  GmailApp.setCurrentMessageAccessToken(accessToken);

  var message = GmailApp.getMessageById(messageId);
  var subject = message.getSubject();
  var from = message.getFrom();

  var card = CardService.newCardBuilder();

  card.setHeader(
    CardService.newCardHeader()
      .setTitle('Phish Alert')
      .setSubtitle('Reportar correo sospechoso')
  );

  var section = CardService.newCardSection();

  section.addWidget(
    CardService.newTextParagraph().setText(
      '<b>De:</b> ' + escapeHtml(from) + '<br><b>Asunto:</b> ' + escapeHtml(subject)
    )
  );

  section.addWidget(
    CardService.newTextParagraph().setText(
      'Si este correo le parece sospechoso (enlaces raros, urgencia injustificada, ' +
      'remitente que no reconoce), repórtelo con el botón de abajo.'
    )
  );

  section.addWidget(
    CardService.newTextButton()
      .setText('🚩 Reportar como Phishing')
      .setBackgroundColor('#e74c3c')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('reportPhishing')
          .setParameters({ subject: subject, from: from })
      )
  );

  card.addSection(section);

  return card.build();
}

/**
 * Handler del botón: envía el reporte al backend de Centinela.
 */
function reportPhishing(e) {
  var subject = e.parameters.subject;
  var from = e.parameters.from;
  var reporterEmail = Session.getActiveUser().getEmail();

  var apiKey = PropertiesService.getScriptProperties().getProperty('PAB_ADDON_API_KEY');
  if (!apiKey) {
    return notify('Falta configurar PAB_ADDON_API_KEY en Project Settings > Script Properties.');
  }
  if (!reporterEmail) {
    return notify('No se pudo determinar su correo de Gmail. Contacte a TI.');
  }

  var payload = {
    reporter_email: reporterEmail,
    reported_subject: subject,
    reported_from: from,
  };

  try {
    var response = UrlFetchApp.fetch(API_BASE + '/api/pab/addon-report', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Pab-Addon-Key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    var body = {};
    try { body = JSON.parse(response.getContentText()); } catch (parseErr) { /* respuesta no-JSON */ }

    if (response.getResponseCode() === 200 && body.success) {
      return notify(body.message || 'Correo reportado correctamente.');
    }
    return notify('No se pudo reportar: ' + (body.error || 'Error del servidor (' + response.getResponseCode() + ')'));
  } catch (err) {
    return notify('Error al conectar con el servidor: ' + err.message);
  }
}

function notify(text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(text))
    .build();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
