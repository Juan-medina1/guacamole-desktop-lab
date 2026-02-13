# Guacamole Desktop & Lab 🚀

Este proyecto es una solución integral para la gestión de escritorios remotos con **grabación de sesiones** y **auditoría completa**. Combina una aplicación de escritorio construida en Electron con una infraestructura de red robusta desplegada en Docker.

## 📂 Estructura del Proyecto

Se recomienda mantener esta estructura de carpetas:

```
proyecto-guacamole/
├── guacamole-desktop/      # Aplicación Electron (Frontend/Backend JS)
│   ├── frontend/           # UI de la aplicación
│   ├── backend/            # Servidor HTTP + WebSocket + API
│   ├── main.js             # Proceso principal de Electron
│   └── package.json
└── guacamole-lab/          # Infraestructura Docker
    ├── docker-compose.yml  # Definición de servicios
    ├── initdb.sql          # Script de inicialización de BD
    └── data/               # Datos persistentes
        ├── postgres/       # Base de datos
        ├── recordings/     # Grabaciones RDP/VNC (.guac)
        └── typescript/     # Logs de sesiones SSH
```

## ✨ Características Principales

### 🖥️ App de Escritorio
- **Interfaz nativa** para conectar a múltiples máquinas (RDP, VNC, SSH)
- **Multisesión**: unirse a una sesión activa con ID compartido
- **Grabación automática** de todas las sesiones
- **Reproductor integrado** para visualizar sesiones grabadas
- **Auditoría completa** con historial de conexiones

### 🔒 Seguridad
- Tokens dinámicos cifrados con **AES-256-CBC**
- Comunicación segura vía WebSocket
- Credenciales nunca almacenadas en frontend

### 🏭 Laboratorio Completo
- Despliegue automático de instancias Ubuntu (VNC/SSH)
- Contenedor Windows RDP (experimental)
- **PostgreSQL** para persistencia de auditorías

### 📹 Sistema de Grabación
- **RDP/VNC**: Grabaciones en formato `.guac` (nativo de Guacamole)
- **SSH**: Typescript con registro de comandos ejecutados
- **Reproducción**: Visualización de sesiones grabadas con controles de play/pausa
- **Almacenamiento**: Rutas mapeadas entre contenedor y host

## 📋 Requisitos Mínimos

### Sistema Operativo
- Windows 10/11, macOS o Linux

### Hardware
- **Procesador**: Soporte para virtualización (VT-x/AMD-V) habilitado en BIOS
- **RAM**: Mínimo 8GB (Recomendado 12GB+)
- **Disco**: 20GB libres (para contenedores + grabaciones)

### Software
- **Node.js** v16 o superior
- **Docker** & **Docker Compose**
- **Git** (para clonar el repositorio)

## 🗄️ Base de Datos

El proyecto utiliza PostgreSQL para almacenar el historial de auditoría de conexiones.

### Esquema de la Tabla Principal

```sql
CREATE TABLE guacamole_connection_history (
    id SERIAL PRIMARY KEY,
    username VARCHAR(128) NOT NULL,
    connection_name VARCHAR(128) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    session_id VARCHAR(256) UNIQUE NOT NULL,
    video_path TEXT,
    text_path TEXT
);
```

### Migración (si ya tienes la BD creada)

Si actualizaste desde una versión anterior, ejecuta estos comandos para agregar las columnas de grabación:

```sql
ALTER TABLE guacamole_connection_history 
ADD COLUMN IF NOT EXISTS video_path TEXT;

ALTER TABLE guacamole_connection_history 
ADD COLUMN IF NOT EXISTS text_path TEXT;
```

**Conexión a la BD desde terminal:**
```bash
docker exec -it guacamole-postgres psql -U guacamole_user -d guacamole_db
```

## 🔑 Configuración de Variables

Antes de iniciar, debes configurar el archivo `guacamole-desktop/backend/config.js`:

```javascript
module.exports = {
    // Clave de cifrado (debe ser exactamente 32 caracteres)
    CRYPT_KEY: 'MySuperSecretKeyForParams1234567',
    
    // Conexión a guacd (daemon de Guacamole)
    GUACD_HOST: '127.0.0.1',
    GUACD_PORT: 4822,
    
    // Rutas de grabación (contenedor vs host)
    RECORDING_PATH_GUACD: '/var/lib/guacamole/recordings',
    TYPESCRIPT_PATH_GUACD: '/var/lib/guacamole/typescript',
    RECORDING_PATH_HOST: path.resolve(__dirname, '../../guacamole-lab/data/recordings'),
    TYPESCRIPT_PATH_HOST: path.resolve(__dirname, '../../guacamole-lab/data/typescript'),
    
    // Conexiones disponibles
    connections: {
        "windows-rdp": {
            connection: {
                type: "rdp",
                settings: {
                    hostname: "windows-rdp-target",
                    port: 3389,
                    username: "Docker",
                    password: "Clave1234",
                    "ignore-cert": "true",
                    security: "any"
                }
            }
        },
        "ubuntu-vnc": {
            connection: {
                type: "vnc",
                settings: {
                    hostname: "ubuntu-vnc-target",
                    port: 5901,
                    password: "Ubuntu123!"
                }
            }
        },
        "ubuntu-ssh": {
            connection: {
                type: "ssh",
                settings: {
                    hostname: "ubuntu-ssh-target",
                    port: 22,
                    username: "sshuser",
                    password: "Ubuntu123!"
                }
            }
        }
    },
    
    // Conexión a PostgreSQL
    db: {
        user: 'guacamole_user',
        host: '127.0.0.1',
        database: 'guacamole_db',
        password: 'guacamole_pass',
        port: 5432
    }
};
```

## 🚀 Guía de Instalación

### 1. Preparar la Infraestructura (Carpeta `guacamole-lab`)

El contenedor de base de datos requiere un script de inicio que se genera desde la imagen de Guacamole:

```bash
cd guacamole-lab

# Generar el script de inicialización SQL
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgres > initdb.sql

# Levantar los contenedores
docker-compose up -d

# Verificar que los contenedores estén corriendo
docker ps
```

### 2. Configurar la Aplicación (Carpeta `guacamole-desktop`)

```bash
cd ../guacamole-desktop

# Instalar dependencias de Node.js
npm install

# Iniciar la aplicación
npm start
```

## 📹 Sistema de Grabación y Auditoría

### Grabación Automática

Todas las sesiones se graban automáticamente:
- **RDP/VNC**: Archivos `.guac` en `guacamole-lab/data/recordings/`
- **SSH**: Archivos de texto en `guacamole-lab/data/typescript/`

### Ver Grabaciones

1. Abre la aplicación
2. Click en "Ver / Ocultar Auditoría"
3. Selecciona una sesión del historial
4. Click en "Abrir" para reproducir

### API de Auditoría

El backend expone los siguientes endpoints:

- `GET /sessions` - Lista todas las sesiones grabadas
- `GET /view-log?sessionId=XXX` - Descarga log de sesión SSH
- `GET /view-video?sessionId=XXX` - Stream de grabación RDP/VNC

## 🤝 Multisesión (Join)

Puedes compartir una sesión activa usando el **ID de sesión** que entrega `guacamole-lite`:

1. Conecta normalmente a una máquina.
2. Copia el **ID actual** desde la barra superior.
3. Abre otra instancia de la app (otro `npm start`).
4. Pega el ID en **Unirse a Sesion** y pulsa **Unirse**.

**Endpoint usado internamente**:
- `GET /token?join=ID` - Genera un token de unión a una sesión activa

## ⚠️ Notas Importantes

### Contenedor Windows RDP


- **Error conocido**: Fallos en el arranque del contenedor o pérdida de conexión
- **Causa**: Requiere recursos de hardware específicos (KVM) no disponibles en todos los entornos

### Almacenamiento de Grabaciones

Las grabaciones pueden ocupar espacio considerable:
- **RDP/VNC**: ~5-10 MB por minuto de sesión
- **SSH**: ~1-2 KB por minuto

Se recomienda implementar rotación de logs periódicamente.

## 🛠️ Troubleshooting

### Problema: Reproducción muestra cursor pero no pantalla
**Solución**: Espera unos segundos tras iniciar la reproducción. Si persiste, reinicia usando el botón "Reiniciar".

### Problema: Error al cargar grabación (404)
**Verificación**: 
```powershell
# Verifica que el archivo existe
ls guacamole-lab/data/recordings/

# Verifica la ruta en la base de datos
docker exec -it guacamole-postgres psql -U guacamole_user -d guacamole_db -c "SELECT session_id, video_path FROM guacamole_connection_history LIMIT 5;"
```

### Problema: Puerto 8000 ya en uso
**Solución**:
```powershell
# Ver qué proceso lo usa
netstat -ano | findstr :8000

# Matar el proceso
taskkill /PID <PID> /F
```

### Problema: Base de datos no responde
**Solución**:
```bash
# Reiniciar contenedor postgres
docker restart guacamole-postgres

# Verificar logs
docker logs guacamole-postgres
```

## 📚 Documentación Adicional

Para detalles técnicos sobre el funcionamiento interno del sistema, consulta [FUNCIONAMIENTO.md](FUNCIONAMIENTO.md).

