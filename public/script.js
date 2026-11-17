const chat = document.getElementById('chat');
const empty = document.getElementById('empty');
const form = document.getElementById('form');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const modeEl = document.getElementById('mode');

let history = []; // riwayat percakapan yang dikirim ke server
let busy = false;

// Escape HTML, lalu render ```kode```, `kode`, dan **tebal** secara minimal.
function render(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
}

function addMessage(role, text, { html = false, error = false } = {}) {
  empty.hidden = true;
  const row = document.createElement('div');
  row.className = `msg ${role === 'user' ? 'user' : 'bot'}${error ? ' error' : ''}`;
  if (role !== 'user') {
    const av = document.createElement('span');
    av.className = 'avatar';
    av.textContent = 'T';
    av.setAttribute('aria-hidden', 'true');
    row.appendChild(av);
  }
  const body = document.createElement('div');
  body.className = 'body';
  if (html) body.innerHTML = text;
  else if (role === 'user' || error) body.textContent = text;
  else body.innerHTML = render(text);
  row.appendChild(body);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
  return row;
}

function setBusy(state) {
  busy = state;
  sendBtn.disabled = state;
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;

  addMessage('user', text);
  history.push({ role: 'user', content: text });
  input.value = '';
  autosize();
  setBusy(true);

  const typing = addMessage('bot', '<span class="typing"><i></i><i></i><i></i></span>', { html: true });

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Terjadi kesalahan.');
    }

    if (!res.body) throw new Error('Browser tidak mendukung streaming respons.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const body = typing.querySelector('.body');
    let buffer = '';
    let reply = '';
    let streamFinished = false;

    const processLine = (line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith('data:')) return;

      const data = trimmedLine.slice('data:'.length).trim();
      if (data === '[DONE]') {
        streamFinished = true;
        return;
      }

      const content = JSON.parse(data);
      if (typeof content !== 'string') {
        throw new Error('Format data streaming tidak valid.');
      }

      reply += content;
      body.innerHTML = render(reply);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(processLine);
    }

    buffer += decoder.decode();
    if (buffer) processLine(buffer);
    if (!streamFinished) throw new Error('Koneksi streaming terputus.');

    history.push({ role: 'assistant', content: reply });
    modeEl.hidden = false;
    modeEl.textContent = 'Mode AI';
  } catch (err) {
    typing.remove();
    history.pop(); // pesan gagal tidak ikut riwayat; pengguna bisa kirim ulang
    addMessage('bot', `${err.message} Coba kirim lagi.`, { error: true });
  } finally {
    setBusy(false);
    input.focus();
  }
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 144) + 'px';
}

form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
input.addEventListener('input', autosize);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send(input.value);
  }
});
document.querySelectorAll('.chip').forEach((c) =>
  c.addEventListener('click', () => send(c.textContent))
);
document.getElementById('reset').addEventListener('click', () => {
  history = [];
  chat.querySelectorAll('.msg').forEach((m) => m.remove());
  empty.hidden = false;
  input.focus();
});
