/* The only doorway between the renderer and the machine. Everything the UI can do to
   the world beyond 127.0.0.1 is one of these named calls — small, reviewable, and
   absent entirely in a plain browser. */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("daybook", {
  pickFolder: () => ipcRenderer.invoke("folder:pick"),
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (patch) => ipcRenderer.invoke("settings:save", patch),
  writeSetup: (payload) => ipcRenderer.invoke("folder:writeSetup", payload),
  storeSecret: (name, value) => ipcRenderer.invoke("secret:store", { name, value }),
  loadSecret: (name) => ipcRenderer.invoke("secret:load", { name }),
  deleteSecret: (name) => ipcRenderer.invoke("secret:delete", { name }),
  detectCli: () => ipcRenderer.invoke("cli:detect"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  protocolHandler: () => ipcRenderer.invoke("protocol:handler"),
  onAuthCallback: (callback) => {
    ipcRenderer.on("daybook:auth-callback", (_event, url) => callback(url));
  },
});
