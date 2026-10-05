/* The only doorway between the renderer and the machine. Everything the UI can do to
   the world beyond 127.0.0.1 is one of these named calls — small, reviewable, and
   absent entirely in a plain browser. */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("daybook", {
  pickFolder: () => ipcRenderer.invoke("folder:pick"),
  loadSettings: (userId) => ipcRenderer.invoke("settings:load", userId),
  saveSettings: (userId, patch) => ipcRenderer.invoke("settings:save", { userId, patch }),
  writeSetup: (payload) => ipcRenderer.invoke("folder:writeSetup", payload),
  readHandover: (text) => ipcRenderer.invoke("setup:readHandover", text),
  inspectFolder: (folder) => ipcRenderer.invoke("folder:inspect", folder),
  adoptSetup: (folder, connection) => ipcRenderer.invoke("folder:adoptSetup", { folder, connection }),
  recordConnection: (folder, connection) =>
    ipcRenderer.invoke("folder:recordConnection", { folder, connection }),
  storeSecret: (name, value) => ipcRenderer.invoke("secret:store", { name, value }),
  loadSecret: (name) => ipcRenderer.invoke("secret:load", { name }),
  deleteSecret: (name) => ipcRenderer.invoke("secret:delete", { name }),
  brief: (folder) => ipcRenderer.invoke("brief:get", folder),
  scheduleStart: (folder) => ipcRenderer.invoke("schedule:start", folder),
  scheduleStop: () => ipcRenderer.invoke("schedule:stop"),
  scheduleStatus: () => ipcRenderer.invoke("schedule:status"),
  planDay: (folder, userId) => ipcRenderer.invoke("plan:run", { folder, userId }),
  proposeDay: (folder, userId, message) => ipcRenderer.invoke("plan:run", { folder, userId, message, propose: true }),
  applyPlan: (proposalId) => ipcRenderer.invoke("plan:apply", { proposalId }),
  discardPlan: (proposalId) => ipcRenderer.invoke("plan:discard", { proposalId }),
  readSchedule: (folder) => ipcRenderer.invoke("folder:schedule", folder),
  setSchedule: (folder, day) => ipcRenderer.invoke("folder:setSchedule", { folder, ...day }),
  revealFolder: (folder) => ipcRenderer.invoke("shell:revealFolder", folder),
  revealLog: (file) => ipcRenderer.invoke("shell:revealLog", file),
  detectCli: () => ipcRenderer.invoke("cli:detect"),
  listCliModels: (name) => ipcRenderer.invoke("cli:models", name),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  startAuthLoopback: () => ipcRenderer.invoke("auth:loopback"),
  listModels: (provider, secret) =>
    ipcRenderer.invoke("connections:listModels", { provider, secret }),
  protocolHandler: () => ipcRenderer.invoke("protocol:handler"),
  getAppearance: () => ipcRenderer.invoke("appearance:get"),
  setAppearance: (value) => ipcRenderer.invoke("appearance:set", value),
  onAuthCallback: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on("daybook:auth-callback", listener);
    return () => ipcRenderer.removeListener("daybook:auth-callback", listener);
  },
});
