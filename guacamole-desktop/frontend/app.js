const Guacamole = require('guacamole-common-js');

let client = null;
let keyboard = null; 

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