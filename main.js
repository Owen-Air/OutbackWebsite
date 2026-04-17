document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clientErrorReportingEnabled = false;

  const reportClientError = (type, payload) => {
    if (!clientErrorReportingEnabled) return;

    const body = JSON.stringify({
      type,
      payload,
      href: window.location.href,
      userAgent: navigator.userAgent,
      ts: new Date().toISOString()
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/client-error', blob);
      return;
    }

    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  };

  window.addEventListener('error', (event) => {
    reportClientError('error', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportClientError('unhandledrejection', {
      message: typeof reason === 'string' ? reason : reason?.message || 'unknown'
    });
  });

  const body = document.body;
  const nav = document.getElementById('nav');
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  const backToTop = document.getElementById('backToTop');
  const cookieBanner = document.getElementById('cookieBanner');
  const soundbars = document.getElementById('soundbars');
  const heroImage = document.querySelector('.hero-bg img');

  const setupScrollProgress = () => {
    const rail = document.createElement('div');
    rail.className = 'site-progress';
    const bar = document.createElement('span');
    rail.appendChild(bar);
    document.body.appendChild(rail);

    const update = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const value = Math.min(1, Math.max(0, window.scrollY / max));
      bar.style.transform = `scaleX(${value.toFixed(4)})`;
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  };

  const setupCommandDock = () => {
    const links = [
      ['Home', '/'],
      ['Spaces', '/spaces'],
      ['Events', '/events'],
      ['Drinks', '/menu'],
      ['Team', '/team'],
      ['History', '/history'],
      ['Find Us', '/find-us'],
      ['Contact', '/contact']
    ];

    const dock = document.createElement('aside');
    dock.className = 'nova-dock';
    dock.setAttribute('aria-label', 'Quick navigation');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'nova-dock-trigger';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'novaDockMenu');
    trigger.setAttribute('aria-label', 'Open quick navigation');
    trigger.textContent = 'NAV';

    const menu = document.createElement('div');
    menu.className = 'nova-dock-menu';
    menu.id = 'novaDockMenu';

    links.forEach(([label, href]) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      if (window.location.pathname === href) {
        a.classList.add('active');
      }
      menu.appendChild(a);
    });

    dock.appendChild(trigger);
    dock.appendChild(menu);
    document.body.appendChild(dock);

    const setOpen = (open) => {
      dock.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', String(open));
    };

    trigger.addEventListener('click', () => {
      setOpen(!dock.classList.contains('open'));
    });

    document.addEventListener('click', (event) => {
      if (!dock.contains(event.target)) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!dock.classList.contains('open'));
      }
    });
  };

  const setupPageTransitions = () => {
    const overlay = document.createElement('div');
    overlay.className = 'page-transition';
    document.body.appendChild(overlay);

    document.querySelectorAll('a[href]').forEach((anchor) => {
      anchor.addEventListener('click', (event) => {
        if (
          anchor.target === '_blank' ||
          anchor.hasAttribute('download') ||
          anchor.getAttribute('href')?.startsWith('#') ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        const url = new URL(anchor.href, window.location.origin);
        if (url.origin !== window.location.origin || url.pathname === window.location.pathname) {
          return;
        }

        event.preventDefault();
        overlay.classList.add('show');
        window.setTimeout(() => {
          window.location.assign(url.toString());
        }, 180);
      });
    });
  };

  const setupPointerAura = () => {
    if (prefersReducedMotion) return;

    const aura = document.createElement('div');
    aura.className = 'pointer-aura';
    document.body.appendChild(aura);

    let rafId = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;

    const render = () => {
      x += (tx - x) * 0.16;
      y += (ty - y) * 0.16;
      aura.style.transform = `translate(${x}px, ${y}px)`;
      rafId = window.requestAnimationFrame(render);
    };

    window.addEventListener('pointermove', (event) => {
      tx = event.clientX;
      ty = event.clientY;
    });

    rafId = window.requestAnimationFrame(render);
    window.addEventListener('beforeunload', () => window.cancelAnimationFrame(rafId));
  };

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
    hamburger.setAttribute('aria-expanded', String(isOpen));
    mobileNav.classList.toggle('open', isOpen);
    body.style.overflow = isOpen ? 'hidden' : '';
  };

  setNavState();
  setupScrollProgress();
  setupCommandDock();
  setupPageTransitions();
  setupPointerAura();
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
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  }

  if (prefersReducedMotion) {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
    document.querySelectorAll('.sr').forEach((el) => el.classList.add('vis'));
    document.querySelectorAll('video[autoplay]').forEach((video) => {
      video.pause();
      video.removeAttribute('autoplay');
    });
  } else {
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
  }

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

  if (heroImage && !prefersReducedMotion) {
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

    const video2Cell = cells.find((cell) => getVideoSource(cell).includes('/inside-venue-loop-2.mp4'));
    const video3Cell = cells.find((cell) => getVideoSource(cell).includes('/inside-venue-loop-3.mp4'));

    if (video2Cell && video3Cell) {
      const photoCells = cells.filter((cell) => cell !== video2Cell && cell !== video3Cell);
      const slots = Array.from({ length: photoCells.length + 1 }, (_, i) => i);

      if (slots.length >= 2) {
        const slotA = slots[Math.floor(Math.random() * slots.length)];
        const remainingSlots = slots.filter((slot) => slot !== slotA);
        const slotB = remainingSlots[Math.floor(Math.random() * remainingSlots.length)];
        const randomClips = Math.random() < 0.5 ? [video2Cell, video3Cell] : [video3Cell, video2Cell];
        const slotToVideo = new Map([
          [slotA, randomClips[0]],
          [slotB, randomClips[1]]
        ]);
        const reorderedCells = [];

        for (let i = 0; i <= photoCells.length; i += 1) {
          if (slotToVideo.has(i)) reorderedCells.push(slotToVideo.get(i));
          if (i < photoCells.length) reorderedCells.push(photoCells[i]);
        }

        const fragment = document.createDocumentFragment();
        reorderedCells.forEach((cell) => {
          if (cell) fragment.appendChild(cell);
        });
        galleryMosaic.appendChild(fragment);
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