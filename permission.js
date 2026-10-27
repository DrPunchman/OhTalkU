// One-time microphone permission grant for the extension origin.
navigator.mediaDevices.getUserMedia({ audio: true })
  .then((s) => {
    s.getTracks().forEach((t) => t.stop());
    document.getElementById('msg').textContent = 'Microphone allowed. You can close this tab and turn the mic on in the side panel.';
  })
  .catch((e) => {
    document.getElementById('msg').textContent = 'Microphone blocked (' + e.name + '). Allow it from the lock icon in the address bar, then reload this page.';
  });
