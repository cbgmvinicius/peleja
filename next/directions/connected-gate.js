globalThis.PELEJA_CONNECTED=true;document.documentElement.classList.add('connected-loading','connected-mode');
try{document.documentElement.dataset.pelejaMotion=localStorage.getItem("peleja-motion")||"on";}catch{document.documentElement.dataset.pelejaMotion="on";}
