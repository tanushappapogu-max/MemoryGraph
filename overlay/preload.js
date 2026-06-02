const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("memorygraph", {
  // Query the memory graph for context
  queryMemory: (dialogue) => ipcRenderer.invoke("query-memory", dialogue),
  // Get system prompt with memory context
  getSystemPrompt: (dialogue) => ipcRenderer.invoke("get-system-prompt", dialogue),
  // Ingest transcript into the graph
  ingestTranscript: (text, source) => ipcRenderer.invoke("ingest-transcript", text, source),
  // Get daemon health
  getHealth: () => ipcRenderer.invoke("get-health"),
  // Get available audio sources
  getAudioSources: () => ipcRenderer.invoke("get-audio-sources"),

  // Listen for events from main process
  onStealthMode: (callback) => ipcRenderer.on("stealth-mode", (_e, active) => callback(active)),
  onCaptureSuccess: (callback) => ipcRenderer.on("capture-success", (_e, msg) => callback(msg)),
  onCaptureError: (callback) => ipcRenderer.on("capture-error", (_e, msg) => callback(msg)),
});
