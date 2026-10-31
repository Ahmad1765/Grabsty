/**
 * Grabsty Waitlist Funnel — Native Engine
 * Built with Vanilla JavaScript: Zero external dependencies (Ponytail Rule)
 * Featuring: lapz.io Kinetic Velocity Marquee, Emil Kowalski tactile physics,
 * 3D card tilt, 60fps parallax, and accessible ARIA state transitions.
 */

document.addEventListener('DOMContentLoaded', () => {
  const isReducedMotion = (typeof window !== 'undefined' && window.matchMedia) 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;
  const isFinePointer = (typeof window !== 'undefined' && window.matchMedia) 
    ? window.matchMedia('(pointer: fine)').matches 
    : true;

  // ---------------------------------------------------------------------------
  // 1. Dynamic Footer Year & Queue Counter
  // ---------------------------------------------------------------------------
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // ---------------------------------------------------------------------------
  // Feature 5: Ambient Lahore & Regional Waitlist Ticker
  // ---------------------------------------------------------------------------
  const globalTickerText = document.getElementById('ticker-text');
  if (globalTickerText) {
    const TICKER_ENTRIES = [
      'Lahore waitlist now open',
      'Payments held in escrow until delivery',
      '24 hours to check every order',
      'Pay by card or cash on delivery',
      'Sellers paid to bank, JazzCash or Easypaisa'
    ];
    let tickerIdx = 0;
    setInterval(() => {
      tickerIdx = (tickerIdx + 1) % TICKER_ENTRIES.length;
      globalTickerText.style.opacity = '0';
      setTimeout(() => {
        globalTickerText.textContent = TICKER_ENTRIES[tickerIdx];
        globalTickerText.style.opacity = '1';
      }, 250);
    }, 4200);
  }

  // ---------------------------------------------------------------------------
  // 2. Scroll Progress Bar
  // ---------------------------------------------------------------------------
  const progressBar = document.getElementById('scroll-progress');
  function updateScrollProgress() {
    if (!progressBar) return;
    const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (totalHeight <= 0) return;
    const progress = Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100));
    progressBar.style.width = `${progress}%`;
  }
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  updateScrollProgress();

  // ---------------------------------------------------------------------------
  // 3. Cursor Ambient Glow
  // ---------------------------------------------------------------------------
  const cursorGlow = document.getElementById('cursor-glow');
  if (cursorGlow && isFinePointer && !isReducedMotion) {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let currentX = mouseX;
    let currentY = mouseY;

    window.addEventListener('pointermove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    function renderGlow() {
      // Smooth lerp for buttery lag
      currentX += (mouseX - currentX) * 0.12;
      currentY += (mouseY - currentY) * 0.12;
      cursorGlow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`;
      requestAnimationFrame(renderGlow);
    }
    requestAnimationFrame(renderGlow);
  } else if (cursorGlow) {
    cursorGlow.style.display = 'none';
  }

  // ---------------------------------------------------------------------------
  // 4. Native Intersection Observer for Scroll Reveals
  // ---------------------------------------------------------------------------
  const revealElements = document.querySelectorAll('.animate-on-scroll');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target); // Free memory once revealed
        }
      });
    }, {
      root: null,
      rootMargin: '100px 0px 50px 0px',
      threshold: 0.01
    });

    revealElements.forEach(el => revealObserver.observe(el));

    // Fallback: Ensure elements visible in the initial viewport are immediately revealed
    setTimeout(() => {
      revealElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight + 80) {
          el.classList.add('in-view');
        }
      });
    }, 100);
  } else {
    revealElements.forEach(el => el.classList.add('in-view'));
  }

  // ---------------------------------------------------------------------------
  // 5. Parallax on Heritage Floating Architectural Accents
  // ---------------------------------------------------------------------------
  const shapes = document.querySelectorAll('.heritage-shape, .memphis-shape');
  if (shapes.length > 0 && !isReducedMotion) {
    let lastScrollY = window.scrollY;
    let ticking = false;

    function updateParallax() {
      const scrollY = window.scrollY;
      shapes.forEach((shape) => {
        const speed = parseFloat(shape.getAttribute('data-speed') || '0.15');
        const rotation = shape.getAttribute('data-rot') || '0';
        const yOffset = scrollY * speed;
        shape.style.transform = `translate3d(0, ${yOffset}px, 0) rotate(${rotation}deg)`;
      });
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      lastScrollY = window.scrollY;
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });
    updateParallax();
  }

  // ---------------------------------------------------------------------------
  // 6. Kinetic Velocity-Coupled Marquee (lapz.io style)
  // ---------------------------------------------------------------------------
  const marqueeTrack = document.getElementById('marquee-track');
  if (marqueeTrack && !isReducedMotion) {
    let marqueePos = 0;
    const baseSpeed = 0.85; // pixels per frame
    let scrollVelocity = 0;
    let lastScrollPos = window.scrollY;
    let lastScrollTime = performance.now();

    window.addEventListener('scroll', () => {
      const now = performance.now();
      const dt = Math.max(1, now - lastScrollTime);
      const dy = window.scrollY - lastScrollPos;
      scrollVelocity = (dy / dt) * 8; // amplify scroll speed
      lastScrollPos = window.scrollY;
      lastScrollTime = now;
    }, { passive: true });

    function tickMarquee() {
      // Decay velocity back to 0
      scrollVelocity *= 0.94;
      const currentSpeed = baseSpeed + Math.abs(scrollVelocity);

      marqueePos -= currentSpeed;

      // Halfway reset for seamless infinite loop
      const streamEl = marqueeTrack.querySelector('.marquee-stream');
      if (streamEl) {
        const streamWidth = streamEl.offsetWidth;
        if (Math.abs(marqueePos) >= streamWidth) {
          marqueePos = 0;
        }
      }

      marqueeTrack.style.transform = `translate3d(${marqueePos}px, 0, 0)`;
      requestAnimationFrame(tickMarquee);
    }
    requestAnimationFrame(tickMarquee);
  }

  // ---------------------------------------------------------------------------
  // 7. Magnetic CTA Button (Fine pointer only)
  // ---------------------------------------------------------------------------
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn && isFinePointer && !isReducedMotion) {
    submitBtn.addEventListener('mousemove', (e) => {
      const rect = submitBtn.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) * 0.28;
      const y = (e.clientY - rect.top - rect.height / 2) * 0.28;
      submitBtn.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });

    submitBtn.addEventListener('mouseleave', () => {
      submitBtn.style.transform = 'translate3d(0, 0, 0)';
    });
  }

  // ---------------------------------------------------------------------------
  // 8. 3D Tilt on Bento Cards (Fine pointer only)
  // ---------------------------------------------------------------------------
  const bentoCards = document.querySelectorAll('.bento-card');
  if (isFinePointer && !isReducedMotion) {
    bentoCards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -6;
        const rotateY = ((x - centerX) / centerX) * 6;

        card.style.setProperty('--rotate-x', `${rotateX.toFixed(2)}deg`);
        card.style.setProperty('--rotate-y', `${rotateY.toFixed(2)}deg`);
        card.style.setProperty('--lift-y', '-6px');
      });

      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--rotate-x', '0deg');
        card.style.setProperty('--rotate-y', '0deg');
        card.style.setProperty('--lift-y', '0px');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 9. Supabase & Persistence Configuration (Zero external libraries)
  // ---------------------------------------------------------------------------
  const SUPABASE_CONFIG = {
    url: 'https://ttxestvncdynsssmjqhk.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0eGVzdHZuY2R5bnNzc21qcWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODM4ODcsImV4cCI6MjA5MTY1OTg4N30.G9nazXwNsD5nTKKALfF8OZqFOEx2ockqtjKn9XhDilA',
    tableName: 'waitlist'
  };

  // ---------------------------------------------------------------------------
  // 10. Referral Ingestion (?ref= query param)
  // ---------------------------------------------------------------------------
  const urlParams = new URLSearchParams(window.location.search);
  const referredByCode = (urlParams.get('ref') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32) || null;
  const referralBanner = document.getElementById('referral-banner');
  const referrerCodeEl = document.getElementById('referrer-code');

  if (referredByCode && referralBanner && referrerCodeEl) {
    referrerCodeEl.textContent = referredByCode.startsWith('#') ? referredByCode : `#${referredByCode}`;
    referralBanner.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // 11. Participant Role & Curation Focus Selectors (Lahore Architecture Focus)
  // ---------------------------------------------------------------------------
  const rolePills = document.querySelectorAll('.role-pill');
  const selectedRoleInput = document.getElementById('selected-role');
  let currentRole = 'buyer';

  rolePills.forEach(pill => {
    pill.addEventListener('click', () => {
      rolePills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-checked', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-checked', 'true');
      currentRole = pill.getAttribute('data-role') || 'buyer';
      if (selectedRoleInput) {
        selectedRoleInput.value = currentRole;
      }
    });

    // Accessible arrow navigation for radiogroup
    pill.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        const next = pill.nextElementSibling || rolePills[0];
        next.focus();
        next.click();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        const prev = pill.previousElementSibling || rolePills[rolePills.length - 1];
        prev.focus();
        prev.click();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 13. Dual Persistence Engine (LocalStorage + Supabase REST)
  // ---------------------------------------------------------------------------
  function getLocalWaitlist() {
    try {
      return JSON.parse(localStorage.getItem('grabsty_waitlist') || '[]');
    } catch {
      return [];
    }
  }

  function saveToLocalStorage(record) {
    try {
      const stored = getLocalWaitlist();
      const existingIdx = stored.findIndex(item => {
        if (record.phone && item.phone && item.phone === record.phone) return true;
        if (record.email && item.email && item.email.toLowerCase() === record.email.toLowerCase()) return true;
        return false;
      });
      if (existingIdx >= 0) {
        stored[existingIdx] = { ...stored[existingIdx], ...record };
      } else {
        stored.push(record);
      }
      localStorage.setItem('grabsty_waitlist', JSON.stringify(stored));
      if (record.email) localStorage.setItem('grabsty_last_email', record.email);
      if (record.phone) localStorage.setItem('grabsty_last_phone', record.phone);
    } catch (err) {
      console.warn('LocalStorage save warning:', err);
    }
  }

  async function rpc(fn, args) {
    const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
      },
      body: JSON.stringify(args)
    });
    if (!res.ok) throw new Error(`${fn} ${res.status}`);
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // 14. Live Position & Referral Count (waitlist_status RPC)
  // ---------------------------------------------------------------------------
  async function updateLiveStatus(code) {
    const posEl = document.getElementById('queue-position');
    const totalEl = document.getElementById('queue-total');
    const refEl = document.getElementById('ref-count');
    try {
      const [row] = await rpc('waitlist_status', { p_code: code });
      if (!row) return;
      if (posEl) posEl.textContent = `#${row.queue_position}`;
      if (totalEl) totalEl.textContent = `of ${row.total} on the list`;
      if (refEl) refEl.textContent = String(row.referrals);
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Feature: Celebration Party Popper Animation (Native HTML5 Canvas)
  // ---------------------------------------------------------------------------
  function triggerPartyPopper() {
    const canvas = document.getElementById('party-popper-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    if (isReducedMotion) {
      return;
    }

    const COLORS = ['#5A59EE', '#CEFF1B', '#FF4110', '#FBD2FF', '#FFFFFF', '#0F0F0F'];
    const particles = [];
    const PARTICLE_COUNT = 140;

    const btnRect = submitBtn ? submitBtn.getBoundingClientRect() : null;
    const originX = btnRect ? (btnRect.left + btnRect.width / 2) : (width / 2);
    const originY = btnRect ? (btnRect.top + btnRect.height / 2) : (height * 0.55);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (Math.random() * Math.PI * 1.5) - (Math.PI * 1.25);
      const speed = Math.random() * 20 + 8;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (Math.random() * 6 + 4),
        size: Math.random() * 8 + 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 18,
        isStreamer: Math.random() > 0.6,
        opacity: 1,
        decay: Math.random() * 0.012 + 0.008,
        gravity: 0.42,
        drag: 0.965
      });
    }

    let animId = null;
    function renderFrame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let aliveCount = 0;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.opacity <= 0.01) continue;
        aliveCount++;

        p.vx *= p.drag;
        p.vy = (p.vy * p.drag) + p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.opacity -= p.decay;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;

        if (p.isStreamer) {
          ctx.fillRect(-p.size / 2, -p.size * 1.5, p.size, p.size * 3);
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        }

        ctx.restore();
      }

      if (aliveCount > 0) {
        animId = requestAnimationFrame(renderFrame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(animId);
      }
    }
    renderFrame();
  }

  // ---------------------------------------------------------------------------
  // 15. Success State Presentation
  // ---------------------------------------------------------------------------
  const formContainer = document.getElementById('form-container');
  const successContainer = document.getElementById('success-container');
  const successQueueTag = document.getElementById('success-queue-tag');
  const successTitle = document.getElementById('success-title');
  const ticketNumber = document.getElementById('ticket-number');
  const shareWaBtn = document.getElementById('share-wa-btn');
  const backToFormBtn = document.getElementById('back-to-form-btn');

  function renderWaitlistSuccess({ role, ticketCode, isReturning }) {
    // No name/phone/email: only the structured choices go to analytics.
    window.posthog?.capture(isReturning ? 'waitlist_returned' : 'waitlist_joined', {
      role, city: 'Lahore', referred: new URLSearchParams(location.search).has('ref'),
    });

    const siteBase = window.location.origin + window.location.pathname.replace(/\/$/, '');
    const cleanCode = ticketCode.replace(/^#/, '');
    const uniqueRefUrl = `${siteBase}?ref=${cleanCode}`;

    if (ticketNumber) ticketNumber.textContent = `#${cleanCode}`;
    if (successQueueTag) successQueueTag.textContent = isReturning ? 'WELCOME BACK' : 'WAITLIST SPOT CONFIRMED';
    if (successTitle) successTitle.textContent = isReturning ? "You're Already On The Waitlist" : "You're On The Waitlist!";

    if (shareWaBtn) {
      const waText = encodeURIComponent(`Join me on the Grabsty waitlist: buy and sell pre-loved clothes, sneakers and bags with escrow protection. ${uniqueRefUrl}`);
      shareWaBtn.href = `https://api.whatsapp.com/send?text=${waText}`;
    }

    // Placeholders until the server answers
    const posEl = document.getElementById('queue-position');
    const totalEl = document.getElementById('queue-total');
    const refEl = document.getElementById('ref-count');
    if (posEl) posEl.textContent = '#…';
    if (totalEl) totalEl.textContent = ' ';
    if (refEl) refEl.textContent = '…';
    updateLiveStatus(cleanCode);

    formContainer.classList.add('hidden');
    successContainer.classList.remove('hidden');
    successContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------------------------------------------------------------------------
  // 16. Waitlist Form Submission (waitlist_join RPC: one spot per phone/email)
  // ---------------------------------------------------------------------------
  const waitlistForm = document.getElementById('waitlist-form');
  const nameInput = document.getElementById('name');
  const nameError = document.getElementById('name-error');
  const phoneInput = document.getElementById('phone');
  const phoneError = document.getElementById('phone-error');
  const emailInput = document.getElementById('email');
  const emailError = document.getElementById('email-error');

  function validateEmail(email) {
    if (!email) return true;
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return re.test(String(email).toLowerCase().trim());
  }

  function showFieldError(input, errEl, msg) {
    if (input) {
      input.classList.add('has-error');
      input.focus();
    }
    if (errEl) errEl.textContent = msg;
  }

  [nameInput, phoneInput, emailInput].forEach(inp => {
    if (inp) {
      inp.addEventListener('input', () => {
        if (inp.classList.contains('has-error')) {
          inp.classList.remove('has-error');
          const errEl = document.getElementById(`${inp.id}-error`);
          if (errEl) errEl.textContent = '';
        }
      });
    }
  });

  function setSubmitting(on) {
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.classList.toggle('loading', on);
    const btnText = submitBtn.querySelector('.btn-text');
    if (btnText) btnText.textContent = on ? 'REGISTERING...' : 'JOIN WAITLIST';
  }

  if (waitlistForm) {
    waitlistForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameVal = nameInput ? nameInput.value.trim() : '';
      const phoneVal = phoneInput ? phoneInput.value.trim() : '';
      const emailVal = emailInput ? emailInput.value.trim().toLowerCase() : '';

      if (!nameVal) return showFieldError(nameInput, nameError, 'Please enter your full name.');
      if (phoneVal.replace(/\D/g, '').length < 7) {
        return showFieldError(phoneInput, phoneError, 'Please enter a valid phone number (at least 7 digits).');
      }
      if (emailVal && !validateEmail(emailVal)) {
        return showFieldError(emailInput, emailError, 'Please enter a valid email address or leave blank.');
      }

      setSubmitting(true);
      let row = null;
      try {
        const [res] = await Promise.all([
          rpc('waitlist_join', {
            p_name: nameVal,
            p_phone: phoneVal,
            p_email: emailVal || null,
            p_role: currentRole,
            p_referred_by: referredByCode
          }),
          new Promise(resolve => setTimeout(resolve, 500))
        ]);
        row = res && res[0];
      } catch {}
      setSubmitting(false);

      // Never show success for a signup that wasn't saved.
      if (!row || !row.code) {
        if (phoneError) phoneError.textContent = "We couldn't save your spot. Check your connection and try again.";
        return;
      }

      saveToLocalStorage({ name: nameVal, phone: phoneVal, email: emailVal || null, role: currentRole, referral_code: row.code });
      if (row.is_new) {
        triggerPartyPopper();
        if (window.grabsty3d) window.grabsty3d.celebrate();
      }
      renderWaitlistSuccess({ role: currentRole, ticketCode: row.code, isReturning: !row.is_new });
    });
  }

  // ---------------------------------------------------------------------------
  // 17. Lookup ("Already joined?"): this device's code, else re-enter phone
  // ---------------------------------------------------------------------------
  const lookupToggleBtn = document.getElementById('lookup-toggle-btn');
  if (lookupToggleBtn) {
    lookupToggleBtn.addEventListener('click', () => {
      const last = getLocalWaitlist().filter(u => u.referral_code).pop();
      if (last) {
        renderWaitlistSuccess({ role: last.role || 'buyer', ticketCode: last.referral_code, isReturning: true });
        return;
      }
      if (phoneInput) phoneInput.focus();
      if (phoneError) {
        phoneError.textContent = 'Enter your name and the phone number you joined with, then tap Join Waitlist to see your position.';
        setTimeout(() => { phoneError.textContent = ''; }, 5000);
      }
    });
  }

  // Back button to return to registration form
  if (backToFormBtn) {
    backToFormBtn.addEventListener('click', () => {
      successContainer.classList.add('hidden');
      formContainer.classList.remove('hidden');
      [nameInput, phoneInput, emailInput].forEach(inp => { if (inp) inp.value = ''; });
      if (nameInput) nameInput.focus();
    });
  }

  // ---------------------------------------------------------------------------
  // 19. Admin CSV Export Shortcut (Ctrl+Shift+E or Cmd+Shift+E)
  // ---------------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      try {
        const stored = getLocalWaitlist();
        if (stored.length === 0) {
          alert('No local waitlist signups recorded yet on this browser.');
          return;
        }
        const headers = ['Name', 'Phone', 'Email', 'City', 'Interest', 'Role', 'Ticket Number', 'Referral Code', 'Referred By', 'Created At'];
        const rows = stored.map(s => [
          `"${s.name || ''}"`,
          `"${s.phone || ''}"`,
          `"${s.email || ''}"`,
          `"${s.city || 'Lahore'}"`,
          `"${s.interest || 'both'}"`,
          `"${s.role || ''}"`,
          `"${s.ticket_number || ''}"`,
          `"${s.referral_code || ''}"`,
          `"${s.referred_by || ''}"`,
          `"${s.created_at || ''}"`
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `grabsty_waitlist_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error('CSV export failed:', err);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 20. Smooth Accordion Handling
  // ---------------------------------------------------------------------------
  const faqDetails = document.querySelectorAll('.faq-item');
  faqDetails.forEach(detail => {
    detail.addEventListener('toggle', () => {
      if (detail.open) {
        faqDetails.forEach(other => {
          if (other !== detail && other.open) {
            other.removeAttribute('open');
          }
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 21. Smooth Navigation & Focus Anchor Handling
  // ---------------------------------------------------------------------------
  document.querySelectorAll('a[href="#waitlist-section"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('waitlist-section');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          if (nameInput && !nameInput.disabled) {
            nameInput.focus();
          }
        }, 450);
      }
    });
  });

});

