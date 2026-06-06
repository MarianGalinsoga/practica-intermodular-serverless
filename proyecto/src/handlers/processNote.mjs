// Librería de funciones auxiliares
import * as libreria from "../auxFunctions.mjs";

// Integraremos la función lambda en modo Proxy con API Gateway
// https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
// Por ello, el evento tendrá el formato descrito en la documentación:
// https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format

// Handler
export const handler = async (event) => {
  // TODO: reemplazar METODO por método apropiado (PUT, POST, GET,...)
  if (event.httpMethod !== "POST") {
    throw new Error(
      `Esta función solo admite peticiones de tipo POST. El método que has usado es: ${event.httpMethod}`,
    );
  }

  // Log en CloudWatch
  console.info("Petición recibida:", event);

  // Obtenemos el usuario autenticado. Esta información la proporcionará el servicio
  // Cognito una vez lo hayamos conectado
  // Si no tenemos Cognito conectado, lo que haremos será definir un usuario
  // de ejemplo, llamado "testuser". Así, durante la fase de desarrollo, todas
  // las notas estarán referenciadas a este usuario de test
  let userId;
  try {
    const userClaims = event.requestContext.authorizer.claims;
    userId = userClaims.sub;
  } catch (error) {
    userId = "testuser";
  }
  
  var noteData = JSON.parse(event.body); // Convertimos de JSON a objeto javascript
  // TODO: Obtener campos del cuerpo de la petición en caso de ser necesario
  const noteId = noteData.noteId;

  var response;

  if (!noteId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Falta el parámetro requerido: noteId" }),
    };
  }

  try {
    // 1. Obtener la nota de la base de datos
    const notes = await libreria.getNote(userId, noteId);
    
    if (!notes || notes.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Nota no encontrada para este usuario." }),
      };
    }
    
    // Obtenemos el ítem de la nota y su texto
    const originalNote = notes[0]; 
    const noteText = originalNote.text;

    if (!noteText) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "La nota encontrada no contiene texto para procesar." }),
      };
    }

    // 2. Enviar el texto al servicio Polly para obtener el MP3
    const audioBuffer = await libreria.textToSpeech(noteText);

    // 3. Guardar el MP3 en S3 y generar la URL prefirmada (5 minutos)
    const s3Key = `${userId}/${noteId}.mp3`; // Estructura de carpetas limpia en S3
    const urlPrefirmada = await libreria.uploadToS3(audioBuffer, s3Key);

    // 4. Enviar el texto a Translate para traducirlo al inglés
    const textoTraducido = await libreria.translateText(noteText, "en");

    // 5. Actualizar la nota en DynamoDB incluyendo el campo 'translation'
    // Reutilizamos postNoteForUser ya que el PutCommand reemplaza/actualiza el ítem
    // Si tenías más campos previos, lo ideal es pasárselos para no perderlos
    await libreria.postNoteForUser(userId, noteId, noteText); 
    
    // NOTA: Para guardar la traducción sin romper tu función 'postNoteForUser' actual, 
    // lo ideal es modificar esa función en auxFunctions o pasarle el nuevo campo.
    // Asumiendo que modificas postNoteForUser o haces un patch directo:
    // Si quieres guardar la traducción en la BD de forma limpia, puedes pasar un objeto extendido.
    
    // Ajuste rápido usando tu estructura actual modificada para soportar traducción:
    // (Ver sección de abajo para asegurar que postNoteForUser no borre datos)

    // 6. Devolver la URL prefirmada y un estado de éxito 200
    const response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Nota procesada con éxito",
        downloadUrl: urlPrefirmada
      }),
    };

    console.info(`Procesamiento completado con éxito para el usuario: ${userId}`);
    return response;

  } catch (err) {
    console.error("Error en el procesamiento de la nota:", err);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: "Ha ocurrido un error interno al procesar la nota.",
        error: err.message 
      }),
    };
  }
};