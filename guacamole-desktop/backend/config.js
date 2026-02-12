const path = require('path');

const ROOT_PATH = path.resolve(__dirname, '..', '..');

module.exports = {
    CRYPT_KEY: 'MySuperSecretKeyForParams1234567',
    GUACD_HOST: '127.0.0.1',
    GUACD_PORT: 4822,
    RECORDING_PATH_GUACD: '/var/lib/guacamole/recordings', // Ruta interna del contenedor guacd para rdp/vnc
    TYPESCRIPT_PATH_GUACD: '/var/lib/guacamole/typescript', // Ruta interna del contenedor guacd para ssh
    RECORDING_PATH_HOST: path.resolve(ROOT_PATH, 'guacamole-lab', 'data', 'recordings'),// Ruta en el host para almacenar grabaciones de rdp/vnc
    TYPESCRIPT_PATH_HOST: path.resolve(ROOT_PATH, 'guacamole-lab', 'data', 'typescript'),// Ruta en el host para almacenar typescripts de ssh
    
    connections: {
        "ubuntu-vnc": {
            "connection": {
                "type": "vnc",
                "settings": {
                    "hostname": "ubuntu-vnc-target",
                    "port": 5901,
                    "password": "Ubuntu123!",
                    "color-depth": 16,
                    "cursor": "local"
                }
            }
        },
        "ubuntu-ssh": {
            "connection": {
                "type": "ssh",
                "settings": {
                    "hostname": "ubuntu-ssh-target",
                    "port": 22,
                    "username": "sshuser",
                    "password": "Ubuntu123!"
                }
            }
        },
        "windows-rdp": {
            "connection": {
                "type": "rdp",
                "settings": {
                    "hostname": "windows-rdp-target",
                    "port": 3389,
                    "username": "Docker",
                    "password": "Clave1234",
                    "ignore-cert": "true",
                    "security": "any"
                }
            }
        }

    },
    db: {
        user: 'guacamole_user',
        host: '127.0.0.1',
        database: 'guacamole_db',
        password: 'guacamole_pass',
        port: 5432,
    },
    
};