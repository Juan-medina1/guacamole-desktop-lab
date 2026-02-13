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

El sistema graba automáticamente todas las sesiones mediante configuración dinámica inyectada en el token:

#### Proceso de Grabación

**Flujo de configuración**:
```javascript
// En backend/server.js al generar token
const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

if (connectionType === 'rdp' || connectionType === 'vnc') {
    // Configurar grabación de video
    connectionConfig.connection.settings['recording-path'] = '/var/lib/guacamole/recordings';
    connectionConfig.connection.settings['recording-name'] = sessionId;
    connectionConfig.connection.settings['create-recording-path'] = 'true';
} 
else if (connectionType === 'ssh') {
    // Configurar typescript (log de comandos)
    connectionConfig.connection.settings['typescript-path'] = '/var/lib/guacamole/typescript';
    connectionConfig.connection.settings['typescript-name'] = sessionId;
    connectionConfig.connection.settings['create-typescript-path'] = 'true';
    connectionConfig.connection.settings['recording-include-keys'] = 'true';
}
```

#### Almacenamiento de Grabaciones

**Rutas de contenedor → host**:

| Tipo | Ruta en guacd (contenedor) | Ruta en host |
|------|---------------------------|--------------|
| RDP/VNC | `/var/lib/guacamole/recordings/` | `guacamole-lab/data/recordings/` |
| SSH | `/var/lib/guacamole/typescript/` | `guacamole-lab/data/typescript/` |

**Mapeo en docker-compose.yml**:
```yaml
guacd:
  volumes:
    - ./data/recordings:/var/lib/guacamole/recordings
    - ./data/typescript:/var/lib/guacamole/typescript
```

**Función de mapeo de rutas**:
```javascript
function mapGuacdPathToHost(filePath, hostBase, guacdBase) {
    // Convierte /var/lib/guacamole/recordings/session_xxx
    // a C:\...\guacamole-lab\data\recordings\session_xxx
    if (filePath.startsWith(guacdBase)) {
        const relative = filePath.slice(guacdBase.length);
        return path.resolve(hostBase, relative);
    }
    return path.resolve(filePath);
}
```

### 7. Auditoría en Base de Datos

**Tabla**: `guacamole_connection_history` en PostgreSQL

#### Esquema de la Tabla

```sql
CREATE TABLE guacamole_connection_history (
    id SERIAL PRIMARY KEY,
    username VARCHAR(128) NOT NULL,
    connection_name VARCHAR(128) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    session_id VARCHAR(256) UNIQUE NOT NULL,
    video_path TEXT,           -- Ruta completa en el host
    text_path TEXT             -- Ruta completa en el host
);
```

#### Registro de Sesión

Cada conexión registra:
```javascript
await pool.query(
    `INSERT INTO guacamole_connection_history 
    (username, connection_name, start_date, session_id, video_path, text_path) 
    VALUES ($1, $2, NOW(), $3, $4, $5)`,
    [
        'admin_electron',                    // Usuario fijo
        'ubuntu-vnc',                        // ID de conexión
        'session_1769723531357_9ermogycp',  // SessionID único
        'C:\\...\\data\\recordings\\session_...', // Ruta en host
        null                                 // Solo SSH usa text_path
    ]
);
```

#### Endpoints de Auditoría

El backend expone tres endpoints REST:

**1. Listar sesiones**
```http
GET http://localhost:8000/sessions
```
Retorna array JSON con todas las sesiones ordenadas por fecha descendente.

**2. Ver log de sesión SSH**
```http
GET http://localhost:8000/view-log?sessionId=session_xxx
```
- Busca `text_path` en DB para el sessionId
- Si no existe en DB, usa fallback: `config.TYPESCRIPT_PATH_HOST/sessionId`
- Mapea ruta de contenedor a host usando `mapGuacdPathToHost()`
- Retorna contenido del archivo como texto plano

**3. Ver grabación RDP/VNC**
```http
GET http://localhost:8000/view-video?sessionId=session_xxx
```
- Busca `video_path` en DB para el sessionId
- Si no existe en DB, usa fallback: `config.RECORDING_PATH_HOST/sessionId`
- Mapea ruta de contenedor a host usando `mapGuacdPathToHost()`
- Stream del archivo `.guac` como `application/octet-stream`
- Header `Content-Length` incluido para mejor streaming

### 7.1 Reproductor de Sesiones

**Componente**: Guacamole SessionRecording

#### Implementación del Reproductor

```javascript
// En frontend/app.js
async function abrirAuditoria(id, tipo) {
    if (tipo === 'Escritorio') {
        const videoUrl = `http://localhost:8000/view-video?sessionId=${id}`;
        
        // Crear túnel HTTP estático
        const tunnel = new Guacamole.StaticHTTPTunnel(videoUrl);
        
        // Crear reproductor de sesión grabada
        reproductor = new Guacamole.SessionRecording(tunnel);
        
        // Obtener display y agregarlo al DOM
        const playerDisplay = reproductor.getDisplay();
        const playerElement = playerDisplay.getElement();
        display.appendChild(playerElement);
        
        // Configurar auto-escalado
        playerDisplay.onresize = function(width, height) {
            const scale = Math.min(
                display.clientWidth / width,
                600 / height
            );
            playerDisplay.scale(scale);
        };
        
        // Conectar y reproducir
        reproductor.connect();
        setTimeout(() => reproductor.play(), 1000);
    }
}
```

#### Controles del Reproductor

- **Play**: `reproductor.play()`
- **Pausar**: `reproductor.pause()`
- **Reiniciar**: `reproductor.seek(0)`
- **Eventos**:
  - `onplay`: Dispara cuando comienza reproducción
  - `onpause`: Dispara cuando se pausa
  - `onerror`: Dispara en caso de error

#### Formato de Grabación `.guac`

Las grabaciones RDP/VNC usan el formato nativo de Guacamole:
- **Estructura**: Instrucciones del protocolo Guacamole secuenciales con timestamps
- **Ventaja**: Reproductor nativo de Guacamole (`SessionRecording`)
- **Tamaño**: ~5-10 MB por minuto (depende de actividad en pantalla)
- **Compatibilidad**: Solo reproducible con Guacamole SessionRecording

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

## Troubleshooting

### Problema: Reproducción muestra cursor pero no escritorio

**Síntoma**: Al reproducir una sesión RDP/VNC, el cursor del mouse se mueve pero la pantalla queda en blanco.

**Causas posibles**:
1. **Escalado incorrecto**: El display no se está escalando adecuadamente
2. **Instrucciones de display retrasadas**: Las instrucciones del protocolo Guacamole pueden estar desordenadas en la grabación

**Solución aplicada**:
```javascript
// En abrirAuditoria() de app.js
playerDisplay.onresize = function(width, height) {
    const scale = Math.min(
        display.clientWidth / width,
        600 / height
    );
    playerDisplay.scale(scale);
};
```

**Verificación**:
1. Abrir DevTools (F12) en la app Electron
2. Observar mensajes en consola durante reproducción
3. Verificar que el evento `onresize` se dispare
4. Confirmar que `width` y `height` tengan valores válidos

**Workarounds**:
- Esperar unos segundos después de iniciar reproducción
- Reiniciar la reproducción con el botón "Reiniciar"
- Cerrar y abrir nuevamente el modal de reproducción

### Problema: Error al cargar grabación (404)

**Síntoma**: Error "Video no disponible" o 404 en consola.

**Causa**: La ruta de la grabación no se mapeó correctamente entre contenedor y host.

**Solución**:
1. Verificar que el archivo existe:
```powershell
ls C:\Users\User\Desktop\Proyecto-guacamole\guacamole-lab\data\recordings\
```

2. Verificar que el sessionId es correcto en la base de datos:
```powershell
docker exec -it guacamole-postgres psql -U guacamole_user -d guacamole_db -c "SELECT session_id, video_path FROM guacamole_connection_history WHERE video_path IS NOT NULL ORDER BY start_date DESC LIMIT 5;"
```

3. Revisar los logs del backend:
```javascript
// En /view-video endpoint
console.log('Sirviendo video desde ruta:', filePath);
console.log('Archivo existe:', fs.existsSync(filePath));
```

### Problema: Grabación de SSH no contiene comandos

**Síntoma**: El typescript muestra solo caracteres de control, no los comandos ejecutados.

**Causa**: El contenedor SSH puede no estar configurado para guardar historial correctamente.

**Solución**:
Asegurarse de que `recording-include-keys` está en `true`:
```javascript
connectionConfig.connection.settings['recording-include-keys'] = 'true';
```

### Problema: Contenedor Windows RDP no inicia

**Síntoma**: Error al iniciar `windows-rdp-target` en Docker.

**Causa**: El contenedor Windows requiere virtualización KVM, que no está disponible en Windows.

**Solución**:
Este contenedor solo funciona en Linux con KVM habilitado. En Windows, usar alternativas:
- Usar VNC o SSH en contenedores Linux
- Conectar a máquinas Windows reales en la red local
- Usar WSL2 con nested virtualization (experimental)

### Problema: Puerto 8000 ya en uso

**Síntoma**: Error `EADDRINUSE` al iniciar la app.

**Solución**:
1. Ver qué proceso usa el puerto:
```powershell
netstat -ano | findstr :8000
```

2. Matar el proceso:
```powershell
taskkill /PID <PID> /F
```

3. O cambiar el puerto en [config.js](guacamole-desktop/backend/config.js):
```javascript
const PORT = 8001;
```

### Problema: Base de datos no tiene registros

**Síntoma**: La tabla `guacamole_connection_history` está vacía.

**Solución**:
1. Verificar que el contenedor postgres esté corriendo:
```powershell
docker ps | findstr postgres
```

2. Verificar que `initdb.sql` se ejecutó correctamente:
```powershell
docker logs guacamole-postgres | findstr "CREATE TABLE"
```

3. Si la tabla no existe, recrearla:
```powershell
docker exec -i guacamole-postgres psql -U guacamole_user -d guacamole_db < guacamole-lab/initdb.sql
```

### Problema: Conexión WebSocket falla inmediatamente

**Síntoma**: Error de conexión al intentar conectar a la máquina remota.

**Causas posibles**:
1. **Token inválido**: Verificar que el cifrado/descifrado funciona
2. **guacd no responde**: Verificar que el contenedor guacd está corriendo
3. **Máquina objetivo inalcanzable**: Verificar red Docker

**Diagnóstico**:
```powershell
# Verificar contenedores
docker ps

# Verificar logs de guacd
docker logs guacamole-guacd

# Verificar red Docker
docker network inspect guacamole-network

# Probar conexión manual a guacd
telnet localhost 4822
```

### Logs y Debugging

**Backend logs** (server.js):
- Token generado: `console.log('Token generado para:', connectionId)`
- Registros en DB: `console.log('Sesión registrada:', session_id)`
- Streaming de video: `console.log('Sirviendo video:', filePath)`

**Frontend logs** (app.js):
- Conexión iniciada: `console.log('Conectando con sessionId:', sessionId)`
- Reproducción iniciada: `console.log('Conectando reproductor...')`
- Estados del reproductor: `console.log('Reproducción iniciada')`

**Activar logs de guacamole-lite**:
```javascript
// En server.js, pasar opciones de debug al constructor
const GuacamoleLite = require('guacamole-lite');
const server = new GuacamoleLite(/* opciones */, {
    log: {
        level: 'DEBUG'
    }
});
```

**Verificar conectividad contenedores**:
```powershell
# Ping desde guacd a ubuntu-vnc-target
docker exec guacamole-guacd ping ubuntu-vnc-target

# Verificar puerto VNC
docker exec guacamole-guacd nc -zv ubuntu-vnc-target 5901
```
