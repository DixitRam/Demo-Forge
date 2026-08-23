import type { StatusReply, UiMessage } from '../messages.js';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const startBtn = $<HTMLButtonElement>('start');
const stopBtn = $<HTMLButtonElement>('stop');
const dot = $('dot');
const label = $('label');
const count = $('count');
const error = $('error');

function render(s: StatusReply): void {
  startBtn.hidden = s.recording;
  stopBtn.hidden = !s.recording;
  dot.classList.toggle('live', s.recording);
  label.textContent = s.recording ? 'Recording' : 'Idle';
  count.textContent = `recorded ${s.eventCount} event${s.eventCount === 1 ? '' : 's'}`;
  error.hidden = !s.error;
  error.textContent = s.error ?? '';
}

async function send(msg: UiMessage): Promise<void> {
  render((await chrome.runtime.sendMessage(msg)) as StatusReply);
}

startBtn.addEventListener('click', () => void send({ type: 'DF_START' }));
stopBtn.addEventListener('click', () => void send({ type: 'DF_STOP' }));

void send({ type: 'DF_STATUS' });
setInterval(() => void send({ type: 'DF_STATUS' }), 500);
