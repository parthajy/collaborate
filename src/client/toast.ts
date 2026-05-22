// The transient status toast — reuses the .toast element already in room.html.

const el = document.getElementById('toast') as HTMLElement;
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string): void {
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), 1800);
}
