import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class LegalController {
  @Get('privacy-policy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getPrivacyPolicy() {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Política de Privacidad - Kiichpam Agent Bot</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #222; }
    h1, h2 { color: #123456; }
  </style>
</head>
<body>
  <h1>Política de Privacidad</h1>

  <p>En Kiichpam Agent Bot respetamos y protegemos la privacidad de nuestros usuarios.</p>

  <h2>Información que recopilamos</h2>
  <p>Podemos recopilar información como nombre, número de teléfono, correo electrónico, mensajes enviados por WhatsApp y datos necesarios para gestionar solicitudes de información o reservas.</p>

  <h2>Uso de la información</h2>
  <p>La información recopilada se utiliza para brindar atención al cliente, responder dudas, gestionar reservas, enviar confirmaciones y mejorar la calidad del servicio.</p>

  <h2>Compartición de información</h2>
  <p>No vendemos ni compartimos información personal con terceros para fines comerciales. La información puede procesarse mediante servicios necesarios para la operación, como Meta WhatsApp Business Platform.</p>

  <h2>Seguridad</h2>
  <p>Aplicamos medidas técnicas y administrativas para proteger la información contra accesos no autorizados, pérdida o uso indebido.</p>

  <h2>Derechos del usuario</h2>
  <p>El usuario puede solicitar acceso, corrección o eliminación de sus datos personales escribiendo al correo de contacto.</p>

  <h2>Contacto</h2>
  <p>Correo electrónico: mkt.grupohoka@gmail.com</p>

  <p>Última actualización: abril 2026.</p>
</body>
</html>
`;
  }

  @Get('terms')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getTerms() {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Términos de Servicio - Kiichpam Agent Bot</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #222; }
    h1, h2 { color: #123456; }
  </style>
</head>
<body>
  <h1>Términos de Servicio</h1>

  <p>Al utilizar Kiichpam Agent Bot, aceptas los presentes términos de servicio.</p>

  <h2>Uso del servicio</h2>
  <p>El servicio permite recibir atención al cliente, solicitar información, consultar servicios disponibles y gestionar solicitudes relacionadas con reservas.</p>

  <h2>Disponibilidad</h2>
  <p>El servicio puede estar disponible las 24 horas, aunque no garantizamos funcionamiento continuo o libre de interrupciones.</p>

  <h2>Uso adecuado</h2>
  <p>El usuario se compromete a utilizar el servicio de forma lícita, respetuosa y sin enviar contenido ofensivo, fraudulento o malicioso.</p>

  <h2>Reservas y confirmaciones</h2>
  <p>Las reservas estarán sujetas a disponibilidad, condiciones comerciales, políticas internas y confirmación por los canales oficiales.</p>

  <h2>Limitación de responsabilidad</h2>
  <p>No somos responsables por errores derivados de información incompleta o incorrecta proporcionada por el usuario.</p>

  <h2>Contacto</h2>
  <p>Correo electrónico: mkt.grupohoka@gmail.com</p>

  <p>Última actualización: abril 2026.</p>
</body>
</html>
`;
  }

  @Get('delete-data')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getDeleteData() {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Eliminación de Datos - Kiichpam Agent Bot</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #222; }
    h1, h2 { color: #123456; }
  </style>
</head>
<body>
  <h1>Eliminación de Datos</h1>

  <p>Los usuarios pueden solicitar la eliminación de sus datos personales asociados al uso de Kiichpam Agent Bot.</p>

  <h2>Cómo solicitar la eliminación</h2>
  <p>Envía un correo electrónico a:</p>

  <p><strong>mkt.grupohoka@gmail.com</strong></p>

  <p>Incluye el número de teléfono asociado a la conversación y la solicitud de eliminación de datos.</p>

  <h2>Tiempo de respuesta</h2>
  <p>Procesaremos la solicitud en un plazo razonable, normalmente dentro de 72 horas hábiles.</p>

  <h2>Contacto</h2>
  <p>Correo electrónico: mkt.grupohoka@gmail.com</p>

  <p>Última actualización: abril 2026.</p>
</body>
</html>
`;
  }
}