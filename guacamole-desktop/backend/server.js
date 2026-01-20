const GuacamoleLite = require('guacamole-lite');
const http = require('http');
const url = require('url');
const crypto = require('crypto');
const config = require('./config');

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

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200); res.end(); return;
    }
    
    if (parsedUrl.pathname === '/token' && parsedUrl.query.connection) {
        const connectionId = parsedUrl.query.connection;
        const connectionConfig = config.connections[connectionId];
        
        if (!connectionConfig) {
            res.writeHead(404); res.end(); return;
        }
        
        const token = encryptToken(connectionConfig);
        console.log(`Token generado para ${connectionId}`); // Debug
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token: token }));
        return;
    }
    res.writeHead(404); res.end();
});

const guacServer = new GuacamoleLite(
    { server: server },
    { host: config.GUACD_HOST, port: config.GUACD_PORT },
    {
        crypt: { cypher: 'AES-256-CBC', key: config.CRYPT_KEY },
        log: { level: 'VERBOSE', stdLog: console.log, errorLog: console.error }
    }
);

server.listen(8000, () => console.log('Backend listo en 8000'));