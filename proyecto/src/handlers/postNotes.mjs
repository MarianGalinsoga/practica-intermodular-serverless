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
  // Si no se recibe el método GET, se genera un error
  if (event.httpMethod !== "POST") {
    throw new Error(
      `Esta función solo admite peticiones POST. El método que has usado es: ${event.httpMethod}`,
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
    // Si Cognito no está conectado, la información de autenticación no le será pasada
    // a la función. En este caso utilizaremos un usuario fijo de test, "testuser"
    userId = "testuser";
    email = "test@test.com";
    username = "testuser";
  }

  // Obtenemos los datos de la nota. Vendrán en el "body" de la petición POST
  var noteData = JSON.parse(event.body); // Convertimos de JSON a objeto javascript
  var noteId = noteData.noteId;
  var noteText = noteData.text;

  var response;

  try {
    // Llamamos a la función de la librería encargada de devolver las notas de un usuario
    var data = await libreria.postNoteForUser(userId, noteId, noteText),
      // Si la consulta no genera error, devolvemos un código 201, sin datos
      // Opcionalmente podríamos devolver los datos creados también
      // Resultado que devuelve la función, de acuerdo con el formato descrito en la documentación:
      // https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
      response = {
        statusCode: 201,
        headers: corsHeaders,
      };
  } catch (err) {
    console.log("Error", err);
    // Si la consulta genera error, devolvemos una descripción del error y código 400, con el mismo formato
    var errorMessage = { message: "Ha habido un problema al crear la nota" };
    response = {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify(errorMessage),
    };
  }

  console.info(
    `Petición a ruta: ${event.path}; código de estado: ${response.statusCode}; datos devueltos: ${response.body}; usuario logueado: ${userId}`,
  );

  return response;
};
