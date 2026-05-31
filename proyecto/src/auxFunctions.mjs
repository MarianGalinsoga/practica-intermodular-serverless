// Importación de librerías
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// TODO: importar librerías adicionales (Translate)

// Clientes para interactuar con la API de DynamoDB
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Obtener el nombre de la tabla de DynamoDB a partir de la variable de entorno
const tableName = process.env.APP_TABLE;

// Función para obtener las notas de un usuario
async function getNotesByUser(userId) {
  // Parámetros de la petición de DynamoDB
  // Hacemos una query indicando una condición de igualdad en la clave de partición
  // Asumiendo que el esquema de la tabla haga referencia al userId como valor de la
  // clave de partición
  var params = {
    TableName: tableName,
    ExpressionAttributeValues: {
      ":userId": userId,
    },
    KeyConditionExpression: "userId= :userId",
  };

  // Petición a DynamoDB
  const data = await ddbDocClient.send(new QueryCommand(params));
  return data.Items;
}

// Función para crear una nota para un usuario
async function postNoteForUser(userId, noteId, noteText) {
  // Parámetros de la petición de DynamoDB
  // Petición PUT indicando la clave primaria: partición + ordenación
  var params = {
    TableName: tableName,
    Item: { userId: userId, noteId: noteId, text: noteText },
  };

  // Petición a DynamoDB
  const data = await ddbDocClient.send(new PutCommand(params));
  return data;
}

// Función que recibe un texto de una nota y devuelve un buffer con los datos sintetizados por Polly
async function textToSpeech(text) {
  const pollyClient = new PollyClient();
  const command = new SynthesizeSpeechCommand({
    Text: text,
    OutputFormat: "mp3",
    VoiceId: "Lucia", // Puedes cambiar este valor si lo deseas. Consulta la doc de Polly
  });

  const response = await pollyClient.send(command);
  const audioStream = response.AudioStream;

  // Convertir a buffer
  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

// Función que recibe un buffer con los datos sintetizados por Polly y los almacena en el objeto con nombre "key" en S3
async function uploadToS3(mp3Data, key) {
  const s3Client = new S3Client();

  // Obtener el nombre del bucket S3 a partir de la variable de entorno
  const bucketName = process.env.APP_S3;
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: mp3Data,
    ContentType: "audio/mpeg",
  });

  await s3Client.send(command);

  // TODO: modificar para devolver una URL prefirmada de S3 que permita descargar
  // el audio durante un tiempo limitado de 5 minutos
  return;
}

// TODO: Añadir el resto de funciones necesarias de lógica de negocio

// Función para crear una nota para un usuario
async function deleteNote(userId, noteId) {
  // Parámetros de la petición de DynamoDB
  // Petición PUT indicando la clave primaria: partición + ordenación
  var params = {
    TableName: tableName,
    Item: { userId: userId, noteId: noteId },
  };

  // Petición a DynamoDB
  const data = await ddbDocClient.send(new DeleteCommand(params));
  return data;
}

// TODO: Exportar las funciones creadas
export { getNotesByUser, postNoteForUser, textToSpeech, uploadToS3, deleteNote };
