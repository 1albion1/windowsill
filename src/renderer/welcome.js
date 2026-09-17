const on = (id, event, handler) => document.getElementById(id).addEventListener(event, handler);

on('open-folder', 'click', () => window.windowsill.openCatsFolder());
on('open-guide', 'click', () => window.windowsill.openGuide());
on('done', 'click', () => window.windowsill.close());
on('quit', 'click', () => window.windowsill.quit());

const autoStart = document.getElementById('auto-start');
autoStart.checked = await window.windowsill.getAutoStart();
autoStart.addEventListener('change', () => window.windowsill.setAutoStart(autoStart.checked));
