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
  // Feature 4: Emil Kowalski Tactile Audio Haptics (Native Web Audio API)
  // ---------------------------------------------------------------------------
  class HapticAudioEngine {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      try {
        this.enabled = localStorage.getItem('grabsty_sfx') !== 'false';
      } catch {
        this.enabled = true;
      }
    }
    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }
    click() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.035);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.035);
      } catch {}
    }
    success() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          const t = now + (i * 0.05);
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.06, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.16);
        });
      } catch {}
    }
    toggle() {
      this.enabled = !this.enabled;
      try {
        localStorage.setItem('grabsty_sfx', this.enabled ? 'true' : 'false');
      } catch {}
      if (this.enabled) this.click();
      return this.enabled;
    }
  }
  const hapticAudio = new HapticAudioEngine();

  const sfxToggleBtn = document.getElementById('sfx-toggle-btn');
  if (sfxToggleBtn) {
    function updateSfxButton(enabled) {
      const sfxIcon = document.getElementById('sfx-icon');
      const sfxLabel = sfxToggleBtn.querySelector('.sfx-label');
      if (enabled) {
        sfxToggleBtn.classList.remove('muted');
        sfxToggleBtn.setAttribute('aria-pressed', 'true');
        if (sfxIcon) sfxIcon.textContent = '🔊';
        if (sfxLabel) sfxLabel.textContent = 'SFX: ON';
      } else {
        sfxToggleBtn.classList.add('muted');
        sfxToggleBtn.setAttribute('aria-pressed', 'false');
        if (sfxIcon) sfxIcon.textContent = '🔇';
        if (sfxLabel) sfxLabel.textContent = 'SFX: OFF';
      }
    }
    updateSfxButton(hapticAudio.enabled);

    sfxToggleBtn.addEventListener('click', () => {
      const state = hapticAudio.toggle();
      updateSfxButton(state);
    });
  }

  // ---------------------------------------------------------------------------
  // Feature 5: Ambient Lahore & Regional Waitlist Ticker
  // ---------------------------------------------------------------------------
  const globalTickerText = document.getElementById('ticker-text');
  if (globalTickerText) {
    const TICKER_ENTRIES = [
      'Lahore waitlist now open',
      'Payments held in escrow until delivery',
      '48 hours to check every order',
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
      hapticAudio.click();
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

  const interestPills = document.querySelectorAll('.interest-pill');
  const selectedInterestInput = document.getElementById('selected-interest');
  let currentInterest = 'both';

  interestPills.forEach(pill => {
    pill.addEventListener('click', () => {
      hapticAudio.click();
      interestPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-checked', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-checked', 'true');
      currentInterest = pill.getAttribute('data-interest') || 'both';
      if (selectedInterestInput) {
        selectedInterestInput.value = currentInterest;
      }
    });

    pill.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        const next = pill.nextElementSibling || interestPills[0];
        next.focus();
        next.click();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        const prev = pill.previousElementSibling || interestPills[interestPills.length - 1];
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

  async function postToSupabase(record) {
    try {
      const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.tableName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(record)
      });

      if (response.status === 201 || response.ok) {
        return { success: true, status: response.status };
      }

      // Handle duplicate email (409 Conflict)
      if (response.status === 409) {
        return { success: false, status: 409, conflict: true };
      }

      const errText = await response.text();
      return { success: false, status: response.status, error: errText };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ---------------------------------------------------------------------------
  // 14. Live Referral Tracker
  // ---------------------------------------------------------------------------
  async function updateLiveReferralStats(ticketCode) {
    let count = 0;
    const cleanCode = ticketCode.replace(/^#/, '');

    // 1. Try Supabase count (aggregate RPC — the waitlist table itself is not readable)
    try {
      const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/rpc/waitlist_referral_count`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
        },
        body: JSON.stringify({ p_code: cleanCode })
      });
      if (res.ok) {
        count = parseInt(await res.json(), 10) || 0;
      }
    } catch {}

    // 2. Cross-reference local storage referrals
    const localEntries = getLocalWaitlist();
    const localCount = localEntries.filter(e => e.referred_by === cleanCode || e.referred_by === `#${cleanCode}`).length;
    count = Math.max(count, localCount);

    const refCountText = document.getElementById('ref-count-text');
    if (refCountText) {
      refCountText.textContent = '';
      if (count > 0) {
        const strong = document.createElement('strong');
        strong.textContent = `${count} Friend${count > 1 ? "s" : ""} Joined`;
        refCountText.appendChild(strong);
      } else {
        refCountText.textContent = '0 Referrals Tracked • Priority Queue Locked';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Feature: Celebration Party Popper Animation (Native HTML5 Canvas)
  // ---------------------------------------------------------------------------
  function triggerPartyPopper() {
    hapticAudio.success();
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

    const COLORS = ['#6C47FF', '#F59E0B', '#EC4899', '#10B981', '#FFFFFF', '#0F0F0F', '#60A5FA'];
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
  const successMessage = document.getElementById('success-message');
  const confirmedName = document.getElementById('confirmed-name');
  const confirmedPhone = document.getElementById('confirmed-phone');
  const confirmedEmail = document.getElementById('confirmed-email');
  const confirmedLocation = document.getElementById('confirmed-location');
  const confirmedRole = document.getElementById('confirmed-role');
  const ticketNumber = document.getElementById('ticket-number');
  const referralLinkInput = document.getElementById('referral-link-input');
  const copyRefBtn = document.getElementById('copy-ref-btn');
  const shareXBtn = document.getElementById('share-x-btn');
  const shareWaBtn = document.getElementById('share-wa-btn');
  const nativeShareBtn = document.getElementById('native-share-btn');
  const backToFormBtn = document.getElementById('back-to-form-btn');

  let activeWaitlistData = null;

  function renderWaitlistSuccess({ name, phone, email, city, role, interest, ticketCode, isReturning }) {
    // No name/phone/email: only the structured choices go to analytics.
    window.posthog?.capture(isReturning ? 'waitlist_returned' : 'waitlist_joined', {
      role, interest, city, referred: new URLSearchParams(location.search).has('ref'),
    });
    activeWaitlistData = { name, phone, email, city, role, interest, ticketCode };

    const siteBase = window.location.origin + window.location.pathname.replace(/\/$/, '');
    const cleanCode = ticketCode.replace(/^#/, '');
    const uniqueRefUrl = `${siteBase}?ref=${cleanCode}`;

    if (ticketNumber) ticketNumber.textContent = `#${cleanCode}`;
    if (confirmedName) confirmedName.textContent = name || 'Waitlist Member';
    if (confirmedPhone) confirmedPhone.textContent = phone || '—';
    if (confirmedEmail) confirmedEmail.textContent = email ? email : 'Not provided (SMS/WhatsApp notifications)';
    if (confirmedLocation) confirmedLocation.textContent = city ? `${city}, Pakistan` : 'Lahore, Pakistan';

    if (confirmedRole) {
      const roleLabels = { buyer: 'BUYER', seller: 'SELLER', both: 'BUYER & SELLER' };
      const interestLabels = {
        clothing: 'CLOTHING',
        sneakers_bags: 'SNEAKERS & BAGS',
        both: 'ALL CATEGORIES'
      };
      confirmedRole.textContent = `${roleLabels[role] || 'BUYER'} • ${interestLabels[interest] || 'ALL CATEGORIES'}`;
    }

    if (isReturning) {
      if (successQueueTag) successQueueTag.textContent = 'WELCOME BACK • WAITLIST ACTIVE';
      if (successTitle) successTitle.textContent = "You're Already On The Waitlist";
      if (successMessage) {
        successMessage.textContent = 'You joined from this device earlier. We will message you on WhatsApp or SMS as soon as Grabsty opens in your city.';
      }
    } else {
      if (successQueueTag) successQueueTag.textContent = 'WAITLIST SPOT CONFIRMED';
      if (successTitle) successTitle.textContent = "You're On The Waitlist!";
      if (successMessage) {
        successMessage.textContent = "We will send your invite on WhatsApp or SMS as soon as Grabsty opens in your city.";
      }
    }

    if (referralLinkInput) {
      referralLinkInput.value = uniqueRefUrl;
    }

    // Social Sharing Links
    if (shareXBtn) {
      const xText = encodeURIComponent(`I joined the Grabsty waitlist: buy and sell pre-loved fashion with your payment held in escrow until delivery. ${uniqueRefUrl}`);
      shareXBtn.href = `https://twitter.com/intent/tweet?text=${xText}`;
    }

    if (shareWaBtn) {
      const waText = encodeURIComponent(`Join me on the Grabsty waitlist: buy and sell pre-loved clothes, sneakers and bags without paying strangers upfront. ${uniqueRefUrl}`);
      shareWaBtn.href = `https://api.whatsapp.com/send?text=${waText}`;
    }

    if (nativeShareBtn && typeof navigator.share === 'function') {
      nativeShareBtn.classList.remove('hidden');
      nativeShareBtn.onclick = () => {
        navigator.share({
          title: 'Grabsty Waitlist',
          text: 'Buy and sell pre-loved fashion with your payment held in escrow until delivery.',
          url: uniqueRefUrl
        }).catch(() => {});
      };
    }

    // Refresh live referral stats
    updateLiveReferralStats(cleanCode);

    // Crossfade to Success State
    formContainer.classList.add('hidden');
    successContainer.classList.remove('hidden');
    successContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------------------------------------------------------------------------
  // 16. Waitlist Form Submission
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

  if (waitlistForm) {
    waitlistForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameVal = nameInput ? nameInput.value.trim() : '';
      const phoneVal = phoneInput ? phoneInput.value.trim() : '';
      const emailVal = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const cityVal = 'Lahore';

      // 1. Validate Name
      if (!nameVal) {
        if (nameInput) {
          nameInput.classList.add('has-error');
          nameInput.focus();
        }
        if (nameError) nameError.textContent = 'Please enter your full name.';
        return;
      }

      // 2. Validate Phone (Required, at least 7 digits)
      const digitsOnly = phoneVal.replace(/\D/g, '');
      if (!phoneVal || digitsOnly.length < 7) {
        if (phoneInput) {
          phoneInput.classList.add('has-error');
          phoneInput.focus();
        }
        if (phoneError) phoneError.textContent = 'Please enter a valid phone number (at least 7 digits).';
        return;
      }

      // 3. Validate Email (Optional)
      if (emailVal && !validateEmail(emailVal)) {
        if (emailInput) {
          emailInput.classList.add('has-error');
          emailInput.focus();
        }
        if (emailError) emailError.textContent = 'Please enter a valid email address or leave blank.';
        return;
      }

      // Check if user already registered locally first (by phone or email)
      const localUsers = getLocalWaitlist();
      const existingLocal = localUsers.find(u => 
        (phoneVal && u.phone === phoneVal) || 
        (emailVal && u.email && u.email.toLowerCase() === emailVal)
      );

      if (existingLocal) {
        triggerPartyPopper();
        if (window.grabsty3d) window.grabsty3d.celebrate();
        renderWaitlistSuccess({
          name: existingLocal.name || nameVal,
          phone: existingLocal.phone || phoneVal,
          email: existingLocal.email || emailVal,
          city: existingLocal.city || cityVal,
          role: existingLocal.role || currentRole,
          interest: existingLocal.interest || currentInterest,
          ticketCode: existingLocal.referral_code || `GRB-${existingLocal.ticket_number}`,
          isReturning: true
        });
        return;
      }

      // Enter Loading State
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        const btnText = submitBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'REGISTERING...';
      }

      // Random invite code. It used to be 1000 + (signups on this device), so
      // nearly every visitor got GRB-1001 and they all shared one referral count.
      const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const codeBytes = new Uint8Array(6);
      crypto.getRandomValues(codeBytes);
      const ticketCode = 'GRB-' + Array.from(codeBytes, b => codeAlphabet[b % codeAlphabet.length]).join('');

      const payload = {
        name: nameVal,
        phone: phoneVal,
        email: emailVal || null,
        city: cityVal,
        role: currentRole,
        interest: currentInterest,
        referral_code: ticketCode,
        referred_by: referredByCode || null
      };

      // Dispatch to Supabase
      let supabaseResp = null;
      try {
        const [res] = await Promise.allSettled([
          postToSupabase(payload),
          new Promise(resolve => setTimeout(resolve, 500))
        ]);
        supabaseResp = res.status === 'fulfilled' ? res.value : null;
      } catch {}

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        const btnText = submitBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'JOIN WAITLIST';
      }

      // Email already on the list (unique in the DB). Their original invite
      // code can't be read back, so say so instead of inventing a new one.
      if (supabaseResp && supabaseResp.conflict) {
        if (emailInput) {
          emailInput.classList.add('has-error');
          emailInput.focus();
        }
        if (emailError) emailError.textContent = 'This email is already on the waitlist.';
        return;
      }

      // Never show success for a signup that wasn't saved.
      if (!supabaseResp || !supabaseResp.success) {
        if (phoneError) phoneError.textContent = "We couldn't save your spot. Check your connection and try again.";
        return;
      }

      saveToLocalStorage({ ...payload, created_at: new Date().toISOString() });
      triggerPartyPopper();
      if (window.grabsty3d) window.grabsty3d.celebrate();
      renderWaitlistSuccess({
        name: nameVal,
        phone: phoneVal,
        email: emailVal,
        city: cityVal,
        role: currentRole,
        interest: currentInterest,
        ticketCode: ticketCode,
        isReturning: false
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 17. Lookup Toggle ("Already Registered?")
  // ---------------------------------------------------------------------------
  const lookupToggleBtn = document.getElementById('lookup-toggle-btn');
  if (lookupToggleBtn) {
    lookupToggleBtn.addEventListener('click', async () => {
      const localUsers = getLocalWaitlist();
      if (localUsers.length > 0) {
        const last = localUsers[localUsers.length - 1];
        renderWaitlistSuccess({
          name: last.name || '',
          phone: last.phone || '',
          email: last.email || '',
          city: last.city || 'Lahore',
          role: last.role || 'buyer',
          interest: last.interest || 'both',
          ticketCode: last.referral_code || `GRB-${last.ticket_number}`,
          isReturning: true
        });
        return;
      }

      if (phoneInput) {
        phoneInput.focus();
        if (phoneError) {
          phoneError.textContent = 'Enter your phone number above and click Join Waitlist to check.';
          setTimeout(() => {
            phoneError.textContent = '';
          }, 3500);
        }
      }
    });
  }

  // Back button to return to registration form
  if (backToFormBtn) {
    backToFormBtn.addEventListener('click', () => {
      successContainer.classList.add('hidden');
      formContainer.classList.remove('hidden');
      if (nameInput) {
        nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (emailInput) emailInput.value = '';
        nameInput.focus();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 18. Tactile Multi-Stage Clipboard Copy
  // ---------------------------------------------------------------------------
  if (copyRefBtn && referralLinkInput) {
    copyRefBtn.addEventListener('click', async () => {
      const link = referralLinkInput.value;
      let copiedSuccess = false;

      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(link);
          copiedSuccess = true;
        } catch {
          copiedSuccess = false;
        }
      }

      if (!copiedSuccess) {
        try {
          referralLinkInput.select();
          referralLinkInput.setSelectionRange(0, 99999);
          copiedSuccess = document.execCommand('copy');
        } catch {
          copiedSuccess = false;
        }
      }

      copyRefBtn.classList.add('copied');
      const copyTextEl = copyRefBtn.querySelector('.copy-text');
      if (copyTextEl) copyTextEl.textContent = 'COPIED! ✓';

      setTimeout(() => {
        copyRefBtn.classList.remove('copied');
        if (copyTextEl) copyTextEl.textContent = 'COPY LINK';
      }, 2400);
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
        hapticAudio.click();
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
      hapticAudio.click();
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

  // ---------------------------------------------------------------------------
  // 22. Architectural Blueprint Study Switcher (Study 01 vs Study 02)
  // ---------------------------------------------------------------------------
  const studyTabs = document.querySelectorAll('.arch-study-tab');
  const study01 = document.getElementById('blueprint-study-01');
  const study02 = document.getElementById('blueprint-study-02');

  studyTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const studyId = tab.getAttribute('data-study');
      hapticAudio.click();

      studyTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      if (studyId === '01') {
        if (study01) study01.classList.remove('hidden');
        if (study02) study02.classList.add('hidden');
      } else if (studyId === '02') {
        if (study01) study01.classList.add('hidden');
        if (study02) study02.classList.remove('hidden');
      }
    });
  });
});

