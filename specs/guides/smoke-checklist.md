# Checklist de humo manual (operador)

Doce pasos para probar el paquete `n8n-nodes-brault` contra `stg` antes de un release o
una promoción. Se ejecuta con `npm run dev` (arranca una instancia local de n8n con el
paquete cargado) contra:

- **Base URL:** `https://api.stg.brault.app`
- **API Key:** la que te dio el equipo para `stg`. No la escribas en este archivo, ni en
  un nodo del workflow que vayas a exportar, ni en un commit — solo va en el campo **API
  Key** de la credencial `Brault API` dentro de n8n.

Marca cada casilla según avances. Si algo no pasa lo que dice "Qué debe pasar", para ahí
y repórtalo antes de seguir con el siguiente paso.

## 1. Crear la credencial y probarla

**Qué hacer:** en n8n, crea una credencial `Brault API` con la key de stg y la base URL
de arriba. Usa el botón de prueba de la propia credencial.

**Qué debe pasar:** la prueba responde OK (verde). Si responde error, revisa que la key
no tenga espacios de más y que la base URL sea exactamente `https://api.stg.brault.app`.

## 2. Trigger con `file.created`

**Qué hacer:** crea un workflow nuevo con un nodo `Brault Trigger`, evento
`file.created`, y actívalo. Luego, en la web de stg, sube un fichero cualquiera a una
librería.

**Qué debe pasar:** en unos segundos aparece una ejecución nueva del workflow en n8n, con
un item que trae los datos del fichero que acabas de subir (nombre, id, etc.).

## 3. Desactivar el workflow y comprobar que el endpoint desaparece

**Qué hacer:** desactiva el workflow del paso 2. Luego, en la web de stg, ve a
**Settings → Developers → Webhooks**.

**Qué debe pasar:** el endpoint que n8n creó (nombre `n8n · <nombre del workflow>`) ya no
aparece en la lista.

## 4. File → Get Many con Return All

**Qué hacer:** en un workflow, añade un nodo `Brault`, recurso **File**, operación
**Get Many**, y activa la opción **Return All**.

**Qué debe pasar:** el nodo devuelve todos los ficheros de la librería/carpeta elegida,
no solo la primera página (compara el número de items con lo que ves en la web).

## 5. File → Upload desde Read/Write Files

**Qué hacer:** encadena un nodo **Read/Write Files from Disk** (o similar) con un nodo
`Brault`, recurso **File**, operación **Upload**, apuntando al campo binario que produjo
el nodo anterior.

**Qué debe pasar:** el nodo termina sin error y devuelve el fichero creado; lo ves
aparecer en la librería de destino en la web de stg.

## 6. File → Import From URL con Wait

**Qué hacer:** en un nodo `Brault`, recurso **File**, operación **Import From URL**, pon
una URL pública de un fichero cualquiera y activa **Wait For Completion**.

**Qué debe pasar:** el nodo espera hasta que termine la importación y devuelve el fichero
ya creado (no un import todavía en `queued` o `processing`).

## 7. Comment → Create y verlo en la web

**Qué hacer:** en un nodo `Brault`, recurso **Comment**, operación **Create**, sobre un
fichero existente, escribe un texto de prueba y ejecútalo. Luego abre ese fichero en la
web de stg.

**Qué debe pasar:** el comentario aparece en el panel de comentarios del fichero, con el
texto exacto que pusiste en el nodo.

## 8. Shared Link → Create con `Acceso: review` y abrir la URL

**Qué hacer:** en un nodo `Brault`, recurso **Shared Link**, operación **Create**, Target
Type **File**, y **Acceso** (`access`) en `review`, sobre un fichero existente. Copia la
URL que devuelve y ábrela en una ventana nueva (o de incógnito).

**Qué debe pasar:** la URL abre la vista de revisión pública del fichero, sin pedir
login.

## 9. Transfer → Create con un fichero existente y un binario

**Qué hacer:** en un nodo `Brault`, recurso **Transfer**, operación **Create**, añade a
la vez un `file_id` de un fichero que ya existe en Brault y un campo binario (de un nodo
anterior tipo Read/Write Files). Copia la URL del transfer que devuelve y ábrela.

**Qué debe pasar:** la página del transfer muestra los dos ficheros — el que ya existía
en Brault y el que subiste como binario — y ambos se pueden descargar desde ahí.

## 10. File → Upload eligiendo Library Y Folder desde los desplegables

**Qué hacer:** en un nodo `Brault`, recurso **File**, operación **Upload**, abre
**Additional Fields** y elige tanto **Library** como **Folder** usando el selector
"From list" (el desplegable, no "By ID" a mano). Ejecuta el nodo con un campo binario
válido.

**Qué debe pasar:** el nodo termina sin error 400 y el fichero aparece en la carpeta
exacta que elegiste en el desplegable, no en la raíz de la library ni en otra carpeta.

## 11. File → Download a un campo binario

**Qué hacer:** en un nodo `Brault`, recurso **File**, operación **Download**, con el
`fileId` de un fichero existente. Deja **Output Binary Field** en `data`.

**Qué debe pasar:** el item de salida trae un campo binario `data` con el contenido del
fichero; ábrelo con un nodo **Read/Write Files from Disk** o descárgalo desde el panel de
n8n y confirma que el fichero abre correctamente.

## 12. Board → Query

**Qué hacer:** en un nodo `Brault`, recurso **Board**, operación **Query**, sobre un
board existente con al menos un fichero.

**Qué debe pasar:** el nodo devuelve los ficheros del board que cumplen el filtro (o
todos, si no pusiste filtro), sin error.
