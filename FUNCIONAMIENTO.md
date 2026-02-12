# FUNCIONAMIENTO DEL SISTEMA

## Arquitectura del Sistema

El proyecto consiste en dos componentes principales:

1. **guacamole-desktop**: Aplicación Electron que funciona como cliente
2. **guacamole-lab**: Infraestructura Docker con servicios de backend

## Flujo de Funcionamiento

### 1. Inicio de la Aplicación

**Archivo**: [main.js](guacamole-desktop/main.js)

Cuando ejecutas `npm start`:
- Electron carga la aplicación y crea una ventana de 1200x700px
- Ejecuta automáticamente [backend/server.js](guacamole-desktop/backend/server.js) para levantar el servidor Node.js
- Carga la interfaz desde [frontend/index.html](guacamole-desktop/frontend/index.html)

### 2. Interfaz de Usuario

**Archivo**: [frontend/index.html](guacamole-desktop/frontend/index.html)

La interfaz muestra tres tarjetas de conexión:
- **Windows (RDP)**: Puerto 3389
- **Ubuntu Desktop (VNC)**: Puerto 5901
- **Ubuntu Server (SSH)**: Puerto 22

Cuando presionas "Conectar" en cualquier tarjeta, se ejecuta `connect(machineId)` desde [app.js](guacamole-desktop/frontend/app.js).

### 3. Generación del Token

**Archivo**: [backend/server.js](guacamole-desktop/backend/server.js)

El flujo es el siguiente:

```
Usuario presiona "Conectar" 
    ↓
frontend/app.js solicita: GET /token?connection=ubuntu-vnc
    ↓
Backend busca la configuración en config.connections[connectionId]
    ↓
Genera sessionId único: session_1769723531357_9ermogycp
    ↓
Configura rutas de grabación según el protocolo:
   - RDP/VNC → /var/lib/guacamole/recordings/sessionId (contenedor guacd)
   - SSH → /var/lib/guacamole/typescript/sessionId (contenedor guacd)
    ↓
Registra la sesión en PostgreSQL (tabla guacamole_connection_history)
    ↓
Cifra la configuración con AES-256-CBC usando CRYPT_KEY
    ↓
Retorna el token cifrado al frontend
```

**Función de cifrado**:
```javascript
encryptToken(value)
  → Genera IV aleatorio de 16 bytes
  → Cifra JSON de configuración con AES-256-CBC
  → Retorna token en Base64
```

### 4. Establecimiento de la Conexión

**Archivo**: [frontend/app.js](guacamole-desktop/frontend/app.js)

Una vez recibido el token:

```
1. Crea un WebSocket Tunnel hacia ws://localhost:8000/?token=xxxxx
2. Instancia Guacamole.Client con el tunnel
3. Obtiene el elemento de display y lo inserta en el DOM
4. Configura manejadores de eventos:
   - Teclado: Captura teclas y envía keysym al servidor
   - Mouse: Captura movimientos y clicks
   - Resize: Ajusta escala del display al tamaño de ventana
5. Ejecuta client.connect() para iniciar la conexión
```

### 5. Protocolo Guacamole

**Servidor**: [backend/server.js](guacamole-desktop/backend/server.js)

El servidor utiliza `guacamole-lite` que actúa como proxy entre:
- **Frontend (WebSocket)** ← Protocolo Guacamole → **guacamole-lite** ← Protocolo Guacamole nativo → **guacd**

**guacd** (daemon de Guacamole en Docker):
- Recibe conexiones en puerto 4822
- Decodifica el token cifrado
- Establece la conexión real con el objetivo (RDP/VNC/SSH)
- Traduce el protocolo nativo a protocolo Guacamole
- Retransmite video/input entre cliente y servidor remoto

### 6. Grabación de Sesiones

**Configuración**: [backend/config.js](guacamole-desktop/backend/config.js)

El sistema graba automáticamente todas las sesiones:

**Para RDP/VNC**:
- Se guarda video en `/var/lib/guacamole/recordings/` dentro del contenedor guacd
- Formato: `sessionId` (archivo de video Guacamole)
- Mapeado a: `./data/recordings/` en el host (config.RECORDING_PATH_HOST)

**Para SSH**:
- Se guarda typescript (texto plano) en `/var/lib/guacamole/typescript/`
- Formato: `sessionId` y `sessionId.timing`
- Mapeado a: `./data/typescript/` en el host (config.TYPESCRIPT_PATH_HOST)

### 7. Auditoría en Base de Datos

**Tabla**: `guacamole_connection_history` en PostgreSQL

Cada conexión registra:
```sql
username: 'admin_electron'
connection_name: 'ubuntu-vnc'
start_date: NOW()
session_id: 'session_1769723531357_9ermogycp'
video_path: 'C:\\Users\\User\\Desktop\\Proyecto-guacamole\\guacamole-lab\\data\\recordings\\session_...'
text_path: NULL (solo SSH tiene valor aquí)
```

Nota: Si `video_path` o `text_path` están vacíos, el backend intenta construir la ruta usando
`config.RECORDING_PATH_HOST` o `config.TYPESCRIPT_PATH_HOST` y el `session_id`.

### 8. Infraestructura Docker

**Archivo**: [docker-compose.yml](guacamole-lab/docker-compose.yml)

Los contenedores y sus funciones:

**postgres**:
- Base de datos PostgreSQL en puerto 5432
- Ejecuta `initdb.sql` al iniciar (crea esquema de Guacamole)
- Almacena usuarios, conexiones e historial

**guacd**:
- Daemon de Guacamole en puerto 4822
- Maneja protocolos RDP/VNC/SSH
- Graba sesiones en volúmenes montados

**guacamole** (cliente web oficial):
- Interfaz web en puerto 8081
- No se usa en este proyecto, pero disponible como alternativa
- Conecta con postgres y guacd automáticamente

**Contenedores objetivo**:
- **windows-rdp-target**: Windows 10 con RDP (puerto 3389) - **NOTA**: Requiere KVM y puede ser inestable
- **ubuntu-ssh-target**: Ubuntu 22.04 con SSH (puerto 2222)
- **ubuntu-vnc-target**: Ubuntu con escritorio XFCE y VNC (puerto 5900)

### 9. Configuración de Conexiones

**Archivo**: [backend/config.js](guacamole-desktop/backend/config.js)

Las conexiones están hardcodeadas:

```javascript
connections: {
  "ubuntu-vnc": {
    connection: {
      type: "vnc",
      settings: {
        hostname: "ubuntu-vnc-target",  // Nombre del contenedor Docker
        port: 5901,
        password: "Ubuntu123!",
        color-depth: 16
      }
    }
  }
}
```

El `hostname` usa la resolución DNS interna de Docker (red `guacamole-network`).

### 10. Desconexión

**Función**: `disconnect()` en [app.js](guacamole-desktop/frontend/app.js)

```
1. Ejecuta client.disconnect()
2. Limpia el DOM del display
3. Muestra nuevamente el menú de conexiones
4. El WebSocket se cierra automáticamente
5. guacd finaliza la conexión con el servidor remoto
6. La grabación se guarda en disco
```

## Resumen del Flujo Completo

```
[Usuario] 
   ↓ Presiona "Conectar Ubuntu VNC"
[Frontend - app.js]
   ↓ GET http://localhost:8000/token?connection=ubuntu-vnc
[Backend - server.js]
   ↓ Lee config.connections['ubuntu-vnc']
   ↓ Genera sessionId único
   ↓ Configura recording-path
   ↓ INSERT en PostgreSQL
   ↓ Cifra configuración → token
   ↓ Retorna { token, sessionId }
[Frontend - app.js]
   ↓ Crea WebSocket ws://localhost:8000/?token=xxxxx
   ↓ Instancia Guacamole.Client
   ↓ Adjunta display al DOM
   ↓ client.connect()
[Backend - GuacamoleLite]
   ↓ Descifra token
   ↓ Conecta a guacd:4822
   ↓ Envía configuración de conexión
[guacd en Docker]
   ↓ Se conecta a ubuntu-vnc-target:5901
   ↓ Inicia protocolo VNC
   ↓ Inicia grabación en /var/lib/guacamole/recordings/
   ↓ Traduce VNC ↔ Guacamole protocol
[Usuario]
   ↓ Ve y controla el escritorio remoto
   ↓ Presiona "Volver al menú"
[Frontend]
   ↓ disconnect()
[Sistema]
   ✓ Grabación guardada
   ✓ Registro en DB completado
```

## Auditoria (API)

El frontend usa estas rutas para mostrar historial y reproducir logs/recorder:

- `GET /sessions` → lista historial
- `GET /view-log?sessionId=...` → devuelve texto de SSH (typescript)
- `GET /view-video?sessionId=...` → devuelve video crudo (archivo Guacamole)

## Consultar Sesiones en la Base de Datos

Para ver el historial de sesiones registradas, conecta a PostgreSQL:

**Acceder a la base de datos**:
```powershell
docker exec -it guacamole-postgres psql -U guacamole_user -d guacamole_db
```

**Consultas útiles**:

Ver últimas 10 sesiones:
```sql
SELECT username, connection_name, start_date, end_date, session_id 
FROM guacamole_connection_history 
ORDER BY start_date DESC 
LIMIT 10;
```

Ver sesiones activas (sin fecha de fin):
```sql
SELECT * FROM guacamole_connection_history 
WHERE end_date IS NULL;
```

Ver rutas de grabación:
```sql
SELECT session_id, connection_name, video_path, text_path 
FROM guacamole_connection_history 
ORDER BY start_date DESC;
```

Consulta completa de una sesión específica:
```sql
SELECT * FROM guacamole_connection_history 
WHERE session_id = 'session_1769723531357_9ermogycp';
```

**Desde PowerShell (consulta directa)**:
```powershell
docker exec -it guacamole-postgres psql -U guacamole_user -d guacamole_db -c "SELECT username, connection_name, start_date, session_id FROM guacamole_connection_history ORDER BY start_date DESC LIMIT 10;"
```

## Notas Importantes
- **Credenciales expuestas**: Usuario/password están en `config.js` sin cifrar
- **Token temporal**: El token solo es válido para una conexión
- **Puerto único**: El servidor backend siempre usa puerto 8000
- **Grabaciones persistentes**: Se guardan en `./data/recordings` y `./data/typescript`
