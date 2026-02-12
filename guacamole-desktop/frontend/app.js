const Guacamole = require('guacamole-common-js');

let client = null;
let keyboard = null; 
let reproductor = null; // Variable global para el reproductor de video

if (!keyboard) {
    keyboard = new Guacamole.Keyboard(document);

    keyboard.onkeydown = (keysym) => {
        if (client) {
            client.sendKeyEvent(1, keysym);
            return false; 
        }
    };

    keyboard.onkeyup = (keysym) => {
        if (client) {
            client.sendKeyEvent(0, keysym);
            return false;
        }
    };
}

async function connect(machineId) {
    try {
        // UI
        document.getElementById('menu').classList.add('hidden');
        document.getElementById('display-container').classList.remove('hidden');

        // Token
        const response = await fetch(`http://localhost:8000/token?connection=${machineId}`);
        const { token } = await response.json();

        // Tunnel and Client
        const tunnel = new Guacamole.WebSocketTunnel(
            `ws://localhost:8000/?token=${encodeURIComponent(token)}`
        );

        client = new Guacamole.Client(tunnel);

        // Display
        const display = document.getElementById('display');
        display.innerHTML = '';
        const element = client.getDisplay().getElement();
        display.appendChild(element);

        client.getDisplay().onresize = function(width, height) {
            client.getDisplay().scale(Math.min(
                window.innerWidth / width,
                window.innerHeight / height
            ));
        };
        client.onstatechange = (state) => {
            if (state === 3) { // CONNECTED
                client.sendSize(window.innerWidth, window.innerHeight);
            }
        };

        // Mouse 
        const mouse = new Guacamole.Mouse(element);
        mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (s) => {
            if (client) client.sendMouseState(s);
        };

        // Connect
        client.connect();

    } catch (err) {
        console.error(err);
        alert(err.message);
        disconnect();
    }
}

function disconnect() {
    if (client) {
        client.disconnect();
        client = null; 
    }

    const display = document.getElementById('display');
    display.innerHTML = '';

    document.getElementById('display-container').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
}

window.connect = connect;
window.disconnect = disconnect;

// Función para mostrar/ocultar y disparar la carga
async function toggleAuditoria() {
    const seccion = document.getElementById('seccion-auditoria');
    seccion.classList.toggle('hidden');
    
    // Solo cargamos los datos si la sección se va a mostrar
    if (!seccion.classList.contains('hidden')) {
        await cargarHistorial();
    }
}

// Función que consulta al backend (puerto 8000)
async function cargarHistorial() {
    try {
        const respuesta = await fetch('http://localhost:8000/sessions');
        const sesiones = await respuesta.json();
        
        const tbody = document.getElementById('lista-sesiones');
        tbody.innerHTML = ''; // Limpiar antes de cargar

        sesiones.forEach(sesion => {
            const fila = document.createElement('tr');
            
            // Si es SSH tendrá text_path, si es RDP/VNC tendrá video_path
            const tipo = sesion.video_path ? 'Escritorio' : 'Terminal';

            fila.innerHTML = `
                <td>${new Date(sesion.start_date).toLocaleString()}</td>
                <td>${sesion.connection_name}</td>
                <td>${sesion.username}</td>
                <td>${tipo}</td>
                <td>
                    <button onclick="abrirAuditoria('${sesion.session_id}', '${tipo}')">Ver</button>
                </td>
            `;
            tbody.appendChild(fila);
        });
    } catch (error) {
        console.error('Error al cargar historial:', error);
    }
}

// Función para manejar la apertura de auditoría
async function abrirAuditoria(id, tipo) {
    if (tipo === 'Terminal') {
        try {
            // Aquí hacemos el fetch para leer el archivo .txt
            const respuesta = await fetch(`http://localhost:8000/view-log?sessionId=${id}`);
            
            if (!respuesta.ok) {
                const errorTxt = await respuesta.text();
                throw new Error(errorTxt);
            }
            
            const texto = await respuesta.text();
            
            // Mostrar Modal
            document.getElementById('log-texto').textContent = texto;
            document.getElementById('modal-titulo').innerText = `Auditoría: ${id}`;
            document.getElementById('modal-log').classList.remove('hidden');

        } catch (error) {
            console.error('Error detallado:', error);
            alert(`Error al leer log: ${error.message}Revisa si el archivo existe en la carpeta de grabaciones.`);
        }
    } else {
        // luego usaremos el reproductor de Guacamole 
        try {
            const videoUrl = `http://localhost:8000/view-video?sessionId=${id}`;
            const display = document.getElementById('video-display');
            display.innerHTML = ''; // Limpiar video anterior

            // Crear túnel estático para el archivo de grabación
            const tunnel = new Guacamole.StaticHTTPTunnel(videoUrl);
            reproductor = new Guacamole.SessionPlayer(tunnel);

            // Añadir el display del reproductor al modal
            display.appendChild(reproductor.getDisplay().getElement());

            document.getElementById('modal-video').classList.remove('hidden');

            reproductor.onload = () => {
                reproductor.play();
            };

            reproductor.onerror = (error) => {
                console.error("Error del reproductor:", error);
                alert("Error al reproducir la sesión.");
            };

        } catch (error) {
            console.error("Error al cargar video:", error);
            alert('Error al intentar abrir la grabación de escritorio.');
        }
    }
}

// Funciones para cerrar ventanas emergentes
function cerrarModal() {
    document.getElementById('modal-log').classList.add('hidden');
}

function cerrarVideo() {
    if (reproductor) {
        reproductor.pause();
    }
    document.getElementById('modal-video').classList.add('hidden');
}

// Exportar funciones al objeto window para botones HTML
window.toggleAuditoria = toggleAuditoria;
window.abrirAuditoria = abrirAuditoria;
window.cerrarModal = cerrarModal;
window.cerrarVideo = cerrarVideo;