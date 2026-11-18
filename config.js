/* Configuração compartilhada pelo site e pelo painel (/admin).
   Ao alterar este arquivo, aumente o ?v= nas tags <script src="config.js?v="> do index.html e do admin/index.html (evita cache antigo).
   Preencha depois de implantar o Apps Script (ver apps-script/README.md). Nenhum valor aqui é secreto. */
window.SHC_CONFIG = {
  api: "https://script.google.com/macros/s/AKfycbxYkOR10vbsKRDzY_QosAW2lmRtVWtIFguKjmxNXbzl00bXJFs_ZGSyjGJeeDUD_ZMuHQ/exec",      // URL do app da Web do Apps Script (termina em /exec)
  clientId: "62878526879-du870rleb2ujm49205m0q7s4l5qfmmkb.apps.googleusercontent.com"  // ID do cliente OAuth do Google (termina em .apps.googleusercontent.com)
};
