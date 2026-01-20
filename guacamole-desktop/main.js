const { app, BrowserWindow } = require('electron');

require('./backend/server.js');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  win.loadFile('frontend/index.html');
}

app.whenReady().then(createWindow);
