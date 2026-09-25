import '@fontsource-variable/public-sans';
import '@/ui/tokens.css';
import './practice.css';
import { startCaptureRuntime } from '@/capture/runtime';

// Chrome doesn't let extensions inject scripts into their own pages, so the practice form runs
// the capture runtime itself; the service worker talks to it like to any snipped page.
const w = window as unknown as { __answersnap?: boolean };
if (!w.__answersnap) {
  w.__answersnap = true;
  startCaptureRuntime();
}

const project = document.getElementById('project') as HTMLTextAreaElement;
const counter = document.getElementById('project-counter')!;
project.addEventListener('input', () => (counter.textContent = `${project.value.length}/1000`));

void browser.commands.getAll().then((cmds) => {
  const shortcut = cmds.find((c) => c.name === 'snip-question')?.shortcut;
  if (shortcut) document.getElementById('shortcut')!.textContent = shortcut;
});
