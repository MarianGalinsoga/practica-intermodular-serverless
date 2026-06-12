// Importación de librerías
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// TODO: importar librerías adicionales (Translate)
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Clientes para interactuar con la API de DynamoDB
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const translateClient = new TranslateClient({});
const s3Client = new S3Client({});

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

// Función para obtener una nota específica de un usuario determinado
async function getNote(userId, noteId) {
  // Parámetros de la petición de DynamoDB
  // Hacemos una query indicando una condición de igualdad en la clave de partición
  // Asumiendo que el esquema de la tabla haga referencia al userId como valor de la
  // clave de partición
  var params = {
    TableName: tableName,
    ExpressionAttributeValues: {
      ":userId": userId, ":noteId": noteId
    },
    KeyConditionExpression: "userId= :userId AND noteId= :noteId"
  };

  // Petición a DynamoDB
  const data = await ddbDocClient.send(new GetCommand(params));
  return data.Items;
}

// Función para crear una nota para un usuario
async function postNoteForUser(userId, noteId, noteText, translation) {
  // Parámetros de la petición de DynamoDB
  // Petición PUT indicando la clave primaria: partición + ordenación
  var params = {
    TableName: tableName,
    Item: { userId: userId, noteId: noteId, text: noteText, translation: translation } };

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
  const downloadCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  // el audio durante un tiempo limitado de 5 minutos
  const urlPrefirmada = await getSignedUrl(s3Client, downloadCommand, {
    expiresIn: 300,
  });

  return urlPrefirmada;
}

// TODO: Añadir el resto de funciones necesarias de lógica de negocio

// Función para traducir texto al inglés usando Amazon Translate
async function translateText(text, targetLanguage = "en") {
  const command = new TranslateTextCommand({
    Text: text,
    SourceLanguageCode: "auto",
    TargetLanguageCode: targetLanguage
  });

  const response = await translateClient.send(command);
  return response.TranslatedText;
}

// Función para eliminar una nota para un usuario
async function deleteNote(userId, noteId) {
  // Parámetros de la petición de DynamoDB
  // Petición PUT indicando la clave primaria: partición + ordenación
  var params = {
    TableName: tableName,
    Key: { userId: userId, noteId: noteId },
  };

  // Petición a DynamoDB
  const data = await ddbDocClient.send(new DeleteCommand(params));
  return data;
}

// Función para procesar la nota: Traducir, pasar a audio y subir a S3
async function processNote(userId, noteId) {
  // 1. Recuperamos la nota original de DynamoDB
  const noteArray = await getNote(userId, noteId);
  if (!noteArray || noteArray.length === 0) {
    throw new Error("La nota no existe");
  }
  
  // Dependiendo de cómo devuelva DynamoDB el objeto con GetCommand
  const note = noteArray[0] || noteArray; 
  const originalText = note.text;

  // 2. Traducimos el texto (por ejemplo, al inglés "en")
  const translatedText = await translateText(originalText, "en");

  // 3. Convertimos el texto traducido a audio con Polly
  const audioBuffer = await textToSpeech(translatedText);

  // 4. Subimos el audio a S3 y obtenemos la URL prefirmada
  const s3Key = `${userId}/${noteId}.mp3`;
  const audioUrl = await uploadToS3(audioBuffer, s3Key);

  // 5. Actualizamos la nota en DynamoDB incluyendo la traducción y la URL del audio
  await postNoteForUser(userId, noteId, originalText, translatedText);
  
  // Puedes añadir el campo de la URL del audio modificando los parámetros de postNoteForUser 
  // o creando un comando UpdateCommand específico si fuera necesario.

  return {
    message: "Nota procesada con éxito",
    translation: translatedText,
    audioUrl: audioUrl
  };
}

// TODO: Exportar las funciones creadas
export { getNotesByUser, getNote, postNoteForUser, textToSpeech, uploadToS3, translateText, deleteNote, processNote };