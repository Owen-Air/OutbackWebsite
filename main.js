document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const nav = document.getElementById('nav');
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  const backToTop = document.getElementById('backToTop');
  const cookieBanner = document.getElementById('cookieBanner');
  const soundbars = document.getElementById('soundbars');
  const heroImage = document.querySelector('.hero-bg img');

  const setNavState = () => {
    if (!nav) return;
    const shouldScroll = body.dataset.nav === 'scroll' || !!document.querySelector('.hero');
    if (shouldScroll) {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    } else {
      nav.classList.add('scrolled');
    }
  };

  const setMobileNav = (isOpen) => {
    if (!hamburger || !mobileNav) return;
    hamburger.classList.toggle('open', isOpen);
    mobileNav.classList.toggle('open', isOpen);
    body.style.overflow = isOpen ? 'hidden' : '';
  };

  setNavState();
  window.addEventListener('scroll', setNavState, { passive: true });

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      setMobileNav(!mobileNav.classList.contains('open'));
    });

    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => setMobileNav(false));
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setMobileNav(false);
    });
  }

  if (backToTop) {
    const toggleBackToTop = () => {
      backToTop.classList.toggle('visible', window.scrollY > 400);
    };
    toggleBackToTop();
    window.addEventListener('scroll', toggleBackToTop, { passive: true });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  const srObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('vis');
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.sr').forEach((el) => srObserver.observe(el));

  if (soundbars && !soundbars.children.length) {
    [12, 24, 18, 32, 20, 36, 14, 28, 22, 34, 18, 26, 16, 30].forEach((height) => {
      const bar = document.createElement('div');
      bar.className = 'sound-bar';
      bar.style.setProperty('--min', `${height * 0.3}px`);
      bar.style.setProperty('--max', `${height}px`);
      bar.style.setProperty('--d', `${(0.4 + Math.random() * 0.6).toFixed(2)}s`);
      bar.style.height = `${height * 0.3}px`;
      soundbars.appendChild(bar);
    });
  }

  if (heroImage) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      if (scrollY < window.innerHeight) {
        heroImage.style.transform = `translateY(${scrollY * 0.3}px) scale(1.05)`;
      }
    }, { passive: true });
  }

  const galleryMosaic = document.querySelector('.gallery-mosaic');
  if (galleryMosaic) {
    const cells = Array.from(galleryMosaic.children);
    const getVideoSource = (cell) => cell.querySelector('video source')?.getAttribute('src') || '';

    const mainVideoCell = cells.find((cell) => getVideoSource(cell).includes('/inside-venue-loop.mp4'));
    const video2Cell = cells.find((cell) => getVideoSource(cell).includes('/inside-venue-loop-2.mp4'));
    const video3Cell = cells.find((cell) => getVideoSource(cell).includes('/inside-venue-loop-3.mp4'));

    if (mainVideoCell && video2Cell && video3Cell) {
      const otherCells = cells.filter((cell) => cell !== mainVideoCell && cell !== video2Cell && cell !== video3Cell);
      const totalCells = cells.length;
      const availableSlots = Array.from({ length: Math.max(0, totalCells - 1) }, (_, i) => i + 1);

      if (availableSlots.length >= 2) {
        const slotA = availableSlots[Math.floor(Math.random() * availableSlots.length)];
        const nonAdjacentSlots = availableSlots.filter((slot) => Math.abs(slot - slotA) > 1);

        if (nonAdjacentSlots.length) {
          const slotB = nonAdjacentSlots[Math.floor(Math.random() * nonAdjacentSlots.length)];
          const randomClips = Math.random() < 0.5 ? [video2Cell, video3Cell] : [video3Cell, video2Cell];
          const reorderedCells = new Array(totalCells);
          let otherIndex = 0;

          reorderedCells[0] = mainVideoCell;
          reorderedCells[slotA] = randomClips[0];
          reorderedCells[slotB] = randomClips[1];

          for (let i = 1; i < totalCells; i += 1) {
            if (!reorderedCells[i]) {
              reorderedCells[i] = otherCells[otherIndex];
              otherIndex += 1;
            }
          }

          const fragment = document.createDocumentFragment();
          reorderedCells.forEach((cell) => fragment.appendChild(cell));
          galleryMosaic.appendChild(fragment);
        }
      }
    }
  }

  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');

  if (lightbox && lightboxImage) {
    document.querySelectorAll('.g-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        const img = cell.querySelector('img');
        const label = cell.querySelector('.g-label');
        if (!img) return;
        lightboxImage.src = img.src;
        lightboxImage.alt = img.alt || '';
        if (lightboxCaption) lightboxCaption.textContent = label ? label.textContent : '';
        lightbox.classList.add('open');
      });
    });

    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox || event.target.closest('.lightbox-close')) {
        lightbox.classList.remove('open');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') lightbox.classList.remove('open');
    });
  }

  if (cookieBanner) {
    if (!localStorage.getItem('cookies_choice')) {
      window.setTimeout(() => cookieBanner.classList.add('show'), 1500);
    }

    const closeBanner = (choice) => {
      localStorage.setItem('cookies_choice', choice);
      cookieBanner.classList.remove('show');
    };

    document.getElementById('cookieAccept')?.addEventListener('click', () => closeBanner('accepted'));
    document.getElementById('cookieDecline')?.addEventListener('click', () => closeBanner('declined'));
  }
});