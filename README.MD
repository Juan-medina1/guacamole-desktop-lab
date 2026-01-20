# Guacamole Desktop & Lab 🚀

Este proyecto es una solución integral para la gestión de escritorios remotos. Combina una aplicación de escritorio construida en Electron con una infraestructura de red robusta desplegada en Docker.

# 📂 Estructura del Proyecto, se recomienda mantener esta estructura de carpetas:

proyecto-guacamole

├── guacamole-desktop/      # Código de la aplicación Electron (Frontend/Backend JS)

└── guacamole-lab/          # Infraestructura Docker (Base de Datos, guacd, Targets)

# ✨ Características App de Escritorio: 
Interfaz nativa para conectar a múltiples máquinas.
Seguridad Robusta: Tokens dinámicos cifrados con AES-256-CBC.

Laboratorio Completo: Despliegue automático de instancias Ubuntu (VNC/SSH).
Base de Datos: Persistencia de datos mediante PostgreSQL.

# 📋 Requisitos Mínimos 

Sistema Operativo: 
Windows 10/11, macOS o Linux.

Procesador: Soporte para virtualización (VT-x/AMD-V) habilitado en BIOS.

RAM: Mínimo 8GB (Recomendado 12GB+).

Software:Node.js (v16+)Docker & Docker Compose.

# 🔑 Variables de Entorno y Configuración

Antes de iniciar, debes configurar el archivo guacamole-desktop/backend/config.js: 

CRYPT_KEY: Clave de 32 caracteres para el cifrado de tokens.

GUACD_HOST: IP del motor guacd (usar 127.0.0.1 si corres Docker local).


connections: Diccionario con los datos de acceso de tus contenedores.

# 🚀 Guía de Instalación
1. Preparar la Infraestructura (Carpeta guacamole-lab)

El contenedor de base de datos requiere un script de inicio que se genera desde la imagen de Guacamole.

Bash cd guacamole-lab

# Generar el script de inicialización SQL
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --postgres > initdb.sql

 Levantar los contenedores
docker-compose up -d

#  2. Configurar la Aplicación (Carpeta guacamole-desktop)

Bash cd ../guacamole-desktop

Instalar dependencias de Node.js
npm install

 Iniciar la aplicación (Carpeta guacamole-desktop)
npm start

⚠️ NOTA IMPORTANTE: Contenedor Windows RDP
Estado de Windows RDP: Actualmente, el servicio windows-rdp en el archivo docker-compose.yml presenta problemas de compatibilidad y estabilidad.Error conocido: Fallos en el arranque del contenedor o pérdida de conexión RDP inesperada.Recomendación: Usar preferiblemente las instancias de Ubuntu-VNC o Ubuntu-SSH para pruebas, ya que el contenedor de Windows requiere recursos de hardware específicos (KVM) que no siempre están disponibles en todos los entornos de Docker.