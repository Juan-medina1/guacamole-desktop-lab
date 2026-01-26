module.exports = {
    CRYPT_KEY: 'MySuperSecretKeyForParams1234567',
    GUACD_HOST: '127.0.0.1',
    GUACD_PORT: 4822,
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

    }
};