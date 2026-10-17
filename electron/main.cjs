// Envoltorio de escritorio (Electron) para Football Elite 3D.
// Carga la compilación de dist/ como aplicación nativa a pantalla completa.
const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Sin conexiones en segundo plano ni telemetría del motor Chromium
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('no-pings');

function createWindow() {
  // Evita la descarga de diccionarios del corrector ortográfico
  session.defaultSession.setSpellCheckerEnabled(false);
  session.defaultSession.setSpellCheckerDictionaryDownloadURL('http://127.0.0.1:1/');
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#070b14',
    title: 'Football Elite 3D',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  // jugar.html lleva todo incrustado (también los cánticos): desde file:// el navegador no deja
  // leer otros archivos con fetch, así que es la versión que suena completa
  const single = path.join(__dirname, '..', 'dist', 'jugar.html');
  win.loadFile(fs.existsSync(single) ? single : path.join(__dirname, '..', 'dist', 'index.html'));
  // F11 alterna pantalla completa
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
