const GuacamoleLite = require('guacamole-lite');
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const { Pool } = require('pg'); // Importamos Pool para Postgres
const config = require('./config');
const fs = require('fs'); 
const path = require('path');

// Conexión a la base de datos usando la config 
const pool = new Pool(config.db);

// Función para mapear rutas de guacd a rutas del host 
function mapGuacdPathToHost(filePath, hostBase, guacdBase) {
    if (!filePath) return null;

    if (filePath.startsWith(guacdBase)) {
        const relative = filePath.slice(guacdBase.length).replace(/^[/\\]+/, '');
        return path.resolve(hostBase, relative);
    }

    return path.resolve(filePath);
}

function encryptToken(value) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(config.CRYPT_KEY), iv);

    let encrypted = cipher.update(JSON.stringify(value), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const data = {
        iv: iv.toString('base64'),
        value: encrypted
    };
    
    return Buffer.from(JSON.stringify(data)).toString('base64');
}

// Convertimos a async para manejar los inserts a la DB
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true); //se pasa a true para obtener query como objeto
    
    // RUTA 1: Generación de token 
    if (parsedUrl.pathname === '/token') {
        if (parsedUrl.query.join) {
            const joinId = parsedUrl.query.join;// obtenemos el ID de unión de la query
            const readOnly = parsedUrl.query.readOnly === 'true';

            const joinConfig = {
                connection: {
                    join: joinId,
                    settings: {
                        'read-only': readOnly
                    }
                }
            };

            const token = encryptToken(joinConfig);
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
                token: token,
                joinId: joinId
            }));
            return;
        }

        if (!parsedUrl.query.connection) {
            res.writeHead(400);
            res.end();
            return;
        }

        const connectionId = parsedUrl.query.connection; //obtener el nombre de la conexión
        const baseConfig = config.connections[connectionId]; 
        
        if (!baseConfig) {
            res.writeHead(404); res.end(); 
            return;
        }

        //  LÓGICA DE GRABACIÓN
        let connectionConfig = JSON.parse(JSON.stringify(baseConfig));
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; 
        const connectionType = connectionConfig.connection.type;

        let videoPath = null;
        let textPath = null;

        // Configuración dinámica basada en protocolo
        if (connectionType === 'rdp' || connectionType === 'vnc') {
            connectionConfig.connection.settings['recording-path'] = config.RECORDING_PATH_GUACD;
            connectionConfig.connection.settings['recording-name'] = sessionId;
            connectionConfig.connection.settings['create-recording-path'] = 'true';
            videoPath = `${config.RECORDING_PATH_HOST}/${sessionId}`;
        } 
        else if (connectionType === 'ssh') {
            connectionConfig.connection.settings['typescript-path'] = config.TYPESCRIPT_PATH_GUACD;
            connectionConfig.connection.settings['typescript-name'] = sessionId;
            connectionConfig.connection.settings['create-typescript-path'] = 'true';
            connectionConfig.connection.settings['recording-include-keys'] = 'true';
            textPath = `${config.TYPESCRIPT_PATH_HOST}/${sessionId}`;
        }

        //  REGISTRO EN LA BASE DE DATOS 
        try {
            await pool.query(
                `INSERT INTO guacamole_connection_history 
                (username, connection_name, start_date, session_id, video_path, text_path) 
                VALUES ($1, $2, NOW(), $3, $4, $5)`,
                ['admin_electron', connectionId, sessionId, videoPath, textPath]
            );
            console.log(`[AUDITORÍA] Registro guardado en DB: ${sessionId}`);
        } catch (err) {
            console.error('[DB ERROR] Falló el registro de historial:', err.message);
        }

        const token = encryptToken(connectionConfig);
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' 
        });
        res.end(JSON.stringify({ 
            token: token,
            sessionId: sessionId 
        }));

        return;
    }

    // RUTA 2: Obtener historial de sesiones
    if (parsedUrl.pathname === '/sessions') {
        try {
            const result = await pool.query(
                'SELECT * FROM guacamole_connection_history ORDER BY start_date DESC'
            );
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' 
            });
            res.end(JSON.stringify(result.rows));
        } catch (err) {
            console.error('[DB ERROR] Error al consultar sesiones:', err.message);
            res.writeHead(500); 
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // RUTA 3: Leer el contenido de un Log de SSH (Typescript)
    if (parsedUrl.pathname === '/view-log' && parsedUrl.query.sessionId) {
        const sessionId = parsedUrl.query.sessionId;
        let filePath = null;

        try {
            const result = await pool.query(
                'SELECT text_path FROM guacamole_connection_history WHERE session_id = $1 LIMIT 1',
                [sessionId]
            );
            if (result.rows.length > 0) 
                filePath = result.rows[0].text_path;// obtenemos la ruta del log desde la DB
        } catch (err) {
            console.error('[DB ERROR] Error al buscar log:', err.message);
        }

        //convertir ruta de guacd a ruta del host para leer el archivo
        try {
            const resolvedPath = mapGuacdPathToHost(
                filePath,
                config.TYPESCRIPT_PATH_HOST,
                config.TYPESCRIPT_PATH_GUACD
            );

            if (resolvedPath && fs.existsSync(resolvedPath)) {
                const content = fs.readFileSync(resolvedPath, 'utf8');
                res.writeHead(200, { 
                    'Content-Type': 'text/plain', 
                    'Access-Control-Allow-Origin': '*' 
                });
                res.end(content);
            } else {
                res.writeHead(404); res.end("Archivo de log no encontrado.");
            }
        } catch (err) {
            res.writeHead(500); res.end("Error interno al leer el log.");
        }
        return;
    }

    // RUTA 4: Servir archivos de video crudos (.guac) para el SessionPlayer
    if (parsedUrl.pathname === '/view-video' && parsedUrl.query.sessionId) {
        const sessionId = parsedUrl.query.sessionId;
        let filePath = null;

        console.log(`[VIDEO] Solicitando grabación: ${sessionId}`);

        // Buscamos la ruta en la DB para estar seguros
        try {
            const result = await pool.query(
                'SELECT video_path FROM guacamole_connection_history WHERE session_id = $1 LIMIT 1',
                [sessionId]
            );
            if (result.rows.length > 0) {
                filePath = result.rows[0].video_path;// obtenemos la ruta del video desde la DB
                console.log(`[VIDEO] Ruta desde DB: ${filePath}`);
            }
        } catch (err) {
            console.error('[DB ERROR] Error al buscar video:', err.message);
        }

        // Convertir ruta de guacd a ruta del host para leer el archivo
        try {
            const resolvedPath = mapGuacdPathToHost(
                filePath,
                config.RECORDING_PATH_HOST,
                config.RECORDING_PATH_GUACD
            );

            console.log(`[VIDEO] Ruta final: ${resolvedPath}`);

            if (resolvedPath && fs.existsSync(resolvedPath)) {
                res.writeHead(200, { 
                    'Content-Type': 'application/octet-stream', 
                    'Access-Control-Allow-Origin': '*',
                });
                fs.createReadStream(resolvedPath).pipe(res);
                console.log(`[VIDEO] Enviando archivo...`);
            } else {
                console.log(`[VIDEO] Archivo NO encontrado en: ${resolvedPath}`);
                res.writeHead(404); res.end();
            }
        } catch (err) {
            console.error(`[VIDEO] Error al leer el video:`, err);
            res.writeHead(500); res.end();
        }
        return;
    }
    
    res.writeHead(404); res.end();
});

// Configuración del servidor Guacamole-Lite
const guacServer = new GuacamoleLite( 
    { server: server },
    { host: config.GUACD_HOST, port: config.GUACD_PORT },
    {
        crypt: { cypher: 'AES-256-CBC', key: config.CRYPT_KEY },
        log: { level: 'VERBOSE', stdLog: console.log, errorLog: console.error }
    }
);

server.listen(8000, () => {
    console.log('--- Servidor Guacamole Backend ---');
    console.log('API de Tokens y Auditoría lista en puerto 8000');
});