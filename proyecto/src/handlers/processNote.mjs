// Librería de funciones auxiliares
import * as libreria from "../auxFunctions.mjs";

// Integraremos la función lambda en modo Proxy con API Gateway
// https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
// Por ello, el evento tendrá el formato descrito en la documentación:
// https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format

// Headers CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
};

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
  var userId, email, username;
  try {
    const userClaims = event.requestContext.authorizer.claims;
    userId = userClaims.sub;
    email = userClaims.email;
    username = userClaims["cognito:username"];
  } catch (error) {
    userId = "testuser";
    email = "test@test.com";
    username = "testuser";
  }

  // TODO: Obtener campos del cuerpo de la petición en caso de ser necesario
 let noteId;
  
 try {
  const body = JSON.parse(event.body || "{}");
    noteId = event.pathParameters?.noteId;

    if (!noteId) {
      noteId = body.noteId;
    }

    if (!noteId) {
      noteId = body?.attributes?.noteId;
    }

  } catch (error) {
    console.error("Falta el parámetro requerido: noteId", error);
  }


if (!noteId) {
  return {
    statusCode: 400,
    headers: corsHeaders,
    body: JSON.stringify({ message: "Falta el parámetro requerido: noteId" }),
  };
}

console.log("Processing note:", userId, noteId);

try {
  const result = await libreria.processNote(userId, noteId);
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result),
  };

} catch (err) {
  console.log("Error", err);

  return {
    statusCode: 400,
    headers: corsHeaders,
    body: JSON.stringify({ message: "No se ha podido procesar la nota." }),
  };
}
};