document.addEventListener('DOMContentLoaded', () => {
  let n = 5;
  const el = document.getElementById('countdown');
  const interval = window.setInterval(() => {
    n -= 1;
    if (el) el.textContent = String(n);
    if (n <= 0) {
      window.clearInterval(interval);
      window.location.replace('/contact');
    }
  }, 1000);
});
