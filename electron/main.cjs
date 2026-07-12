// Electron shell for the Steam build.
// Serves the game from the embedded static server (ES modules need HTTP),
// then opens it in a frameless-ish game window.
const path = require('path');
process.env.PORT = process.env.PORT || '8653';
require(path.join(__dirname, '..', 'server.cjs'));

const { app, BrowserWindow, shell } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    autoHideMenuBar: true,
    backgroundColor: '#0b1020',
    title: 'Critterforge',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL('http://localhost:' + process.env.PORT);
  // external links (if any) open in the real browser, not the game window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
