/* ==========================================================================
   EmmaLux — theme behaviour
   No framework, no build step. Everything degrades to working HTML when
   JavaScript is unavailable: forms post normally, links navigate, the
   WhatsApp buttons already carry a valid href rendered by Liquid.
   ========================================================================== */
(function () {
  'use strict';

  var EL = window.EmmaLux || {};
  var strings = EL.strings || {};
  var routes = EL.routes || {};

  /* ----------------------------------------------------------------------
     helpers
     ---------------------------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function on(el, evt, fn, opts) { if (el) el.addEventListener(evt, fn, opts); }

  function debounce(fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  // Mirrors Shopify's money_format so JS-rendered prices match Liquid ones.
  function formatMoney(cents) {
    var fmt = EL.money || '{{ amount }} MAD';
    var value = (cents || 0) / 100;

    function withDelimiters(num, precision, thousands, decimal) {
      num = (num || 0).toFixed(precision);
      var parts = num.split('.');
      var intPart = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousands);
      return parts[1] ? intPart + decimal + parts[1] : intPart;
    }

    return fmt.replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, name) {
      switch (name) {
        case 'amount': return withDelimiters(value, 2, ',', '.');
        case 'amount_no_decimals': return withDelimiters(value, 0, ',', '.');
        case 'amount_with_comma_separator': return withDelimiters(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator': return withDelimiters(value, 0, '.', ',');
        case 'amount_with_space_separator': return withDelimiters(value, 2, ' ', ',');
        case 'amount_no_decimals_with_space_separator': return withDelimiters(value, 0, ' ', ',');
        default: return withDelimiters(value, 2, ',', '.');
      }
    });
  }

  function fetchJSON(url, options) {
    return fetch(url, options).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw data;
        return data;
      });
    });
  }

  /* ----------------------------------------------------------------------
     toast
     ---------------------------------------------------------------------- */
  var toastTimer;
  function toast(message, variant) {
    var node = $('[data-toast]');
    if (!node) {
      node = document.createElement('div');
      node.className = 'toast';
      node.setAttribute('data-toast', '');
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.className = 'toast is-visible' + (variant ? ' toast--' + variant : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.className = 'toast'; }, 3200);
  }

  /* ----------------------------------------------------------------------
     overlay, drawers, search panel
     ---------------------------------------------------------------------- */
  var overlay = $('[data-overlay]');
  var lastFocus = null;

  function lockScroll(lock) {
    document.documentElement.style.overflow = lock ? 'hidden' : '';
    document.body.style.overflow = lock ? 'hidden' : '';
  }

  function showOverlay(show) {
    if (!overlay) return;
    if (show) {
      overlay.hidden = false;
      requestAnimationFrame(function () { overlay.classList.add('is-open'); });
    } else {
      overlay.classList.remove('is-open');
      setTimeout(function () { if (!anyPanelOpen()) overlay.hidden = true; }, 300);
    }
  }

  function anyPanelOpen() {
    return !!$('.drawer.is-open') || !!$('.search-panel.is-open');
  }

  function openPanel(el) {
    if (!el) return;
    lastFocus = document.activeElement;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    showOverlay(true);
    lockScroll(true);
    var focusable = el.querySelector('input, button, a[href], select, textarea');
    if (focusable) setTimeout(function () { focusable.focus(); }, 120);
  }

  function closePanel(el) {
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (!anyPanelOpen()) { showOverlay(false); lockScroll(false); }
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function closeAllPanels() {
    $$('.drawer.is-open, .search-panel.is-open').forEach(function (el) {
      el.classList.remove('is-open');
      el.setAttribute('aria-hidden', 'true');
    });
    showOverlay(false);
    lockScroll(false);
  }

  document.addEventListener('click', function (e) {
    var openBtn = e.target.closest('[data-drawer-open]');
    if (openBtn) {
      e.preventDefault();
      openPanel(document.getElementById(openBtn.getAttribute('data-drawer-open')));
      return;
    }

    if (e.target.closest('[data-drawer-close]')) {
      e.preventDefault();
      closePanel(e.target.closest('.drawer, .search-panel'));
      return;
    }

    if (e.target.closest('[data-search-open]')) {
      e.preventDefault();
      openPanel($('[data-search-panel]'));
      return;
    }

    if (e.target.closest('[data-search-close]')) {
      e.preventDefault();
      closePanel($('[data-search-panel]'));
      return;
    }

    if (e.target.closest('[data-cart-open]')) {
      e.preventDefault();
      openPanel($('[data-cart-drawer]'));
      return;
    }

    if (e.target.hasAttribute && e.target.hasAttribute('data-overlay')) closeAllPanels();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && anyPanelOpen()) closeAllPanels();
  });

  /* ----------------------------------------------------------------------
     colour scheme
     The <head> script already set the attribute before paint; here we only
     handle switching and remembering. Visitors who never touch the control
     keep following their OS setting.
     ---------------------------------------------------------------------- */
  /* Media queries, guarded: a browser without matchMedia should degrade, not
     throw and take the rest of the script down with it. */
  function media(query) {
    return !!(window.matchMedia && window.matchMedia(query).matches);
  }

  var SCHEME_KEY = 'emmalux:scheme';

  function currentScheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyScheme(scheme, remember) {
    document.documentElement.setAttribute('data-theme', scheme);
    if (remember) { try { localStorage.setItem(SCHEME_KEY, scheme); } catch (e) {} }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', scheme === 'dark' ? '#121010' : '#17120f');

    $$('[data-scheme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(scheme === 'dark'));
    });
    document.dispatchEvent(new CustomEvent('emmalux:scheme', { detail: { scheme: scheme } }));
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-scheme-toggle]')) return;
    e.preventDefault();
    applyScheme(currentScheme() === 'dark' ? 'light' : 'dark', true);
  });

  // Follow the OS only while the visitor has not expressed a preference.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onOsChange = function (e) {
      var saved = null;
      try { saved = localStorage.getItem(SCHEME_KEY); } catch (err) {}
      if (!saved) applyScheme(e.matches ? 'dark' : 'light', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onOsChange);
    else if (mq.addListener) mq.addListener(onOsChange);
  }

  applyScheme(currentScheme(), false);

  /* ----------------------------------------------------------------------
     language picker
     ---------------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-lang-toggle]');
    var openMenu = $('[data-lang][data-open]');

    if (toggle) {
      e.preventDefault();
      var wrap = toggle.closest('[data-lang]');
      var isOpen = wrap.hasAttribute('data-open');
      if (openMenu && openMenu !== wrap) {
        openMenu.removeAttribute('data-open');
        openMenu.querySelector('[data-lang-toggle]').setAttribute('aria-expanded', 'false');
      }
      if (isOpen) wrap.removeAttribute('data-open');
      else wrap.setAttribute('data-open', '');
      toggle.setAttribute('aria-expanded', String(!isOpen));
      return;
    }

    if (openMenu && !e.target.closest('[data-lang]')) {
      openMenu.removeAttribute('data-open');
      openMenu.querySelector('[data-lang-toggle]').setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var openMenu = $('[data-lang][data-open]');
    if (!openMenu) return;
    openMenu.removeAttribute('data-open');
    var btn = openMenu.querySelector('[data-lang-toggle]');
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  });

  /* ----------------------------------------------------------------------
     product cards: scroll the photos while the pointer rests on a card
     ---------------------------------------------------------------------- */
  function initCardScroll() {
    var canHover = media('(hover: hover) and (pointer: fine)');
    var reduced = media('(prefers-reduced-motion: reduce)');
    var rtl = document.documentElement.getAttribute('dir') === 'rtl';

    $$('[data-card]').forEach(function (card) {
      if (card.dataset.cardReady) return;
      card.dataset.cardReady = '1';

      var track = $('[data-card-track]', card);
      var segs = $$('.card__progress-seg', card);
      if (!track || segs.length < 2) return;

      var index = 0;
      var timer = null;

      function paint(i) {
        index = i;
        segs.forEach(function (seg, n) { seg.classList.toggle('is-on', n === i); });
      }

      function slide(i) {
        paint(i);
        // The track is laid out LTR even in RTL pages, so the sign is constant.
        track.style.transform = 'translateX(' + (rtl ? '' : '-') + i * 100 + '%)';
      }

      if (canHover) {
        card.addEventListener('mouseenter', function () {
          if (reduced) { slide(1); return; }
          clearInterval(timer);
          timer = setInterval(function () { slide((index + 1) % segs.length); }, 1100);
        });

        card.addEventListener('mouseleave', function () {
          clearInterval(timer);
          slide(0);
        });

        // Keyboard users get the same preview when the card link is focused.
        card.addEventListener('focusin', function () {
          if (!reduced) slide((index + 1) % segs.length);
        });
        card.addEventListener('focusout', function () { slide(0); });
      } else {
        // Touch: the track scrolls natively, we only mirror the position.
        track.addEventListener('scroll', function () {
          var i = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
          if (i !== index) paint(Math.min(Math.abs(i), segs.length - 1));
        }, { passive: true });
      }
    });
  }
  initCardScroll();

  /* ----------------------------------------------------------------------
     announcement rotator
     ---------------------------------------------------------------------- */
  $$('[data-announcement]').forEach(function (bar) {
    var items = $$('.announcement__item', bar);
    if (items.length < 2) return;
    var delay = parseInt(bar.getAttribute('data-rotate'), 10) || 5;
    var i = 0;
    setInterval(function () {
      items[i].classList.remove('is-active');
      i = (i + 1) % items.length;
      items[i].classList.add('is-active');
    }, delay * 1000);
  });

  /* ----------------------------------------------------------------------
     cart
     ---------------------------------------------------------------------- */
  function refreshCartDrawer() {
    return fetch(routes.cart + '?sections=cart-drawer')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var html = data['cart-drawer'];
        if (!html) return;
        var parsed = new DOMParser().parseFromString(html, 'text/html');

        var newBody = parsed.querySelector('[data-cart-drawer-body]');
        var body = $('[data-cart-drawer-body]');
        if (newBody && body) body.innerHTML = newBody.innerHTML;

        var newCount = parsed.querySelector('[data-cart-count]');
        var count = $('[data-cart-count]');
        if (newCount && count) count.textContent = newCount.textContent;
      })
      .catch(function () { /* drawer stays as-is; the cart page remains the fallback */ });
  }

  function updateBubble(itemCount) {
    $$('[data-cart-bubble]').forEach(function (bubble) {
      bubble.textContent = itemCount;
      bubble.hidden = itemCount === 0;
    });
  }

  function addToCart(formData, button) {
    // "Order now" is the same add, followed by checkout instead of the drawer.
    var buyNow = !!(button && button.hasAttribute('data-buy-now'));
    var label = button ? button.querySelector('[data-add-label]') || button : null;
    var original = label ? label.textContent : '';
    if (button) { button.disabled = true; button.classList.add('is-loading'); }

    return fetchJSON(routes.cartAdd, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData
    })
      .then(function () {
        if (buyNow) {
          // Leave the button disabled: the page is on its way out, and
          // re-enabling it invites a second order on a slow connection.
          window.location.href = routes.checkout || '/checkout';
          return null;
        }
        return fetchJSON(routes.cart + '.js');
      })
      .then(function (cart) {
        if (!cart) return null;
        updateBubble(cart.item_count);
        return refreshCartDrawer().then(function () {
          openPanel($('[data-cart-drawer]'));
          toast(strings.added || 'Added');
        });
      })
      .catch(function (err) {
        toast((err && err.description) || strings.unavailable || 'Unavailable', 'error');
      })
      .then(function () {
        if (buyNow) return;
        if (button) { button.disabled = false; button.classList.remove('is-loading'); }
        if (label && original) label.textContent = original;
      });
  }

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-ajax-cart-form]');
    if (!form) return;
    e.preventDefault();
    addToCart(new FormData(form), e.submitter || form.querySelector('[type="submit"]'));
  });

  function changeLine(key, quantity) {
    return fetchJSON(routes.cartChange, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: key, quantity: quantity })
    }).then(function (cart) {
      updateBubble(cart.item_count);
      if ($('[data-cart-page]')) {
        window.location.reload();
        return cart;
      }
      return refreshCartDrawer().then(function () { return cart; });
    });
  }

  // Quantity steppers: product form (local), cart drawer and cart page (server).
  document.addEventListener('click', function (e) {
    var step = e.target.closest('[data-qty-up], [data-qty-down]');
    if (!step) return;
    e.preventDefault();

    var wrap = step.closest('[data-qty]');
    var input = wrap && wrap.querySelector('input');
    if (!input) return;

    var min = parseInt(input.getAttribute('min'), 10);
    if (isNaN(min)) min = 1;
    var current = parseInt(input.value, 10) || min;
    var next = step.hasAttribute('data-qty-up') ? current + 1 : current - 1;
    if (next < min) next = min;

    input.value = next;

    var key = input.getAttribute('data-line-key');
    if (key) changeLine(key, next);
    else input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  document.addEventListener('change', function (e) {
    var input = e.target.closest('[data-cart-qty]');
    if (!input) return;
    var key = input.getAttribute('data-line-key');
    if (key) changeLine(key, parseInt(input.value, 10) || 0);
  });

  document.addEventListener('click', function (e) {
    var remove = e.target.closest('[data-cart-remove]');
    if (!remove) return;
    e.preventDefault();
    changeLine(remove.getAttribute('data-cart-remove'), 0);
  });

  /* ----------------------------------------------------------------------
     product page: variants, gallery, sticky bar
     ---------------------------------------------------------------------- */
  function initProduct(root) {
    var dataEl = $('[data-product-json]');
    if (!dataEl) return;

    var variants;
    try { variants = JSON.parse(dataEl.textContent); } catch (err) { return; }

    var form = $('[data-product-form]', root);
    var idInput = $('[data-variant-id]', root);
    var addBtn = $('[data-add-to-cart]', root);
    var addLabel = $('[data-add-label]', root);
    var priceEl = $('[data-price]', root);
    var discountEl = $('[data-discount]', root);
    var skuEl = $('[data-sku]', root);
    var availabilityEl = $('[data-availability]', root);
    var stickyPrice = $('[data-sticky-price]');

    function selectedOptions() {
      var values = [];
      $$('[data-option-index]', root).forEach(function (group) {
        var active = group.querySelector('[data-option-value][aria-checked="true"]');
        values.push(active ? active.getAttribute('data-value') : null);
      });
      return values;
    }

    function findVariant(values) {
      return variants.filter(function (v) {
        return values.every(function (value, i) { return value === null || v.options[i] === value; });
      })[0];
    }

    function renderPrice(variant) {
      if (!priceEl) return;
      var html = '<span class="price">' + formatMoney(variant.price) + '</span>';
      if (variant.compare_at_price && variant.compare_at_price > variant.price) {
        html = '<span class="price price--sale">' + formatMoney(variant.price) + '</span>' +
          '<s class="price--compare">' + formatMoney(variant.compare_at_price) + '</s>';
      }
      priceEl.innerHTML = html;

      if (discountEl) {
        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
          var pct = Math.round((1 - variant.price / variant.compare_at_price) * 100);
          discountEl.textContent = '-' + pct + '%';
          discountEl.hidden = false;
        } else {
          discountEl.hidden = true;
        }
      }
      if (stickyPrice) stickyPrice.textContent = formatMoney(variant.price);
    }

    function scrollToMedia(variant) {
      if (!variant.featured_media) return;
      var item = $$('[data-gallery-item]', root).filter(function (node) {
        var img = node.querySelector('img');
        return img && variant.featured_media.preview_image &&
          img.src.indexOf(variant.featured_media.preview_image.src.split('?')[0].split('/').pop().split('.')[0]) > -1;
      })[0];
      if (item && item.scrollIntoView) item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    function update(variant) {
      if (!variant) {
        if (addBtn) addBtn.disabled = true;
        if (addLabel) addLabel.textContent = strings.unavailable || '';
        return;
      }

      if (idInput) idInput.value = variant.id;
      if (addBtn) addBtn.disabled = !variant.available;
      if (addLabel) addLabel.textContent = variant.available ? (strings.addToCart || '') : (strings.soldOut || '');
      if (skuEl && variant.sku) skuEl.textContent = skuEl.textContent.split(' ')[0] + ' ' + variant.sku;
      if (availabilityEl) availabilityEl.textContent = variant.available ? availabilityEl.textContent : (strings.soldOut || '');

      renderPrice(variant);
      scrollToMedia(variant);

      // Reflect the variant in the URL so the link can be shared or pasted into WhatsApp.
      if (history.replaceState) {
        var url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        history.replaceState({}, '', url.toString());
      }
    }

    $$('[data-option-value]', root).forEach(function (btn) {
      on(btn, 'click', function () {
        var group = btn.closest('[data-option-index]');
        $$('[data-option-value]', group).forEach(function (sibling) {
          sibling.setAttribute('aria-checked', sibling === btn ? 'true' : 'false');
        });
        var label = group.querySelector('[data-option-selected]');
        if (label) label.textContent = btn.getAttribute('data-value');
        update(findVariant(selectedOptions()));
      });
    });

    // Sticky add-to-cart bar mirrors the main form.
    var stickyAdd = $('[data-sticky-add]');
    on(stickyAdd, 'click', function () {
      if (form) addToCart(new FormData(form), stickyAdd);
    });

    var bar = $('[data-sticky-bar]');
    if (bar && form) {
      var sentinel = form.getBoundingClientRect().top + window.scrollY;
      var onScroll = function () {
        var past = window.scrollY > sentinel + 320;
        bar.classList.toggle('is-visible', past);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  var productRoot = $('[data-product-root]');
  if (productRoot) initProduct(productRoot);

  /* ----------------------------------------------------------------------
     collection: sort + facets
     ---------------------------------------------------------------------- */
  var sortForm = $('[data-sort-form]');
  if (sortForm) {
    on(sortForm.querySelector('select'), 'change', function () {
      var url = new URL(window.location.href);
      url.searchParams.set('sort_by', this.value);
      url.searchParams.delete('page');
      window.location.href = url.toString();
    });
  }

  var facetsToggle = $('[data-facets-toggle]');
  var facets = $('[data-facets]');
  on(facetsToggle, 'click', function () {
    var open = facets.hidden;
    facets.hidden = !open;
    facetsToggle.setAttribute('aria-expanded', String(open));
  });

  if (facets) {
    // Submitting on change keeps the filter UI feeling instant without a library.
    facets.addEventListener('change', debounce(function () {
      if (media('(min-width: 900px)')) facets.submit();
    }, 400));
  }

  /* ----------------------------------------------------------------------
     tabs (home page product grids)
     ---------------------------------------------------------------------- */
  $$('[data-tabs]').forEach(function (tabs) {
    var buttons = $$('[data-tab-target]', tabs);
    buttons.forEach(function (btn) {
      on(btn, 'click', function () {
        buttons.forEach(function (b) { b.setAttribute('aria-selected', String(b === btn)); });
        var targetId = btn.getAttribute('data-tab-target');
        var scope = tabs.parentNode;
        $$('[data-tab-panel]', scope).forEach(function (panel) {
          panel.hidden = panel.id !== targetId;
        });
      });
    });
  });

  /* ----------------------------------------------------------------------
     product recommendations
     ---------------------------------------------------------------------- */
  var recs = $('[data-recommendations]');
  if (recs && recs.getAttribute('data-url')) {
    fetch(recs.getAttribute('data-url'))
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var parsed = new DOMParser().parseFromString(html, 'text/html');
        var grid = parsed.querySelector('[data-recommendations]') || parsed.querySelector('.product-grid');
        if (grid && grid.innerHTML.trim()) recs.innerHTML = grid.innerHTML;
        revealAll();
        initCardScroll();
      })
      .catch(function () { /* the Liquid fallback grid is already on the page */ });
  }

  /* ----------------------------------------------------------------------
     predictive search
     ---------------------------------------------------------------------- */
  var searchPanel = $('[data-search-panel]');
  if (searchPanel && routes.predictive) {
    var input = searchPanel.querySelector('input[type="search"], input[name="q"]');
    var results = searchPanel.querySelector('[data-search-results]');

    if (input && results) {
      on(input, 'input', debounce(function () {
        var q = input.value.trim();
        if (q.length < 2) { results.innerHTML = ''; return; }

        fetch(routes.predictive + '?q=' + encodeURIComponent(q) + '&resources[type]=product&resources[limit]=6&section_id=predictive-search')
          .then(function (r) { return r.text(); })
          .then(function (html) {
            var parsed = new DOMParser().parseFromString(html, 'text/html');
            var list = parsed.querySelector('.product-grid, [data-predictive-results]');
            results.innerHTML = list ? list.outerHTML : '';
          })
          .catch(function () { results.innerHTML = ''; });
      }, 300));
    }
  }

  /* ----------------------------------------------------------------------
     reveal on scroll
     ---------------------------------------------------------------------- */
  var observer;
  function revealAll() {
    var targets = $$('.reveal:not(.is-in)');
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.style.animationDelay = (entry.target.dataset.delay || 0) + 'ms';
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    }
    targets.forEach(function (el, i) {
      el.dataset.delay = (i % 4) * 70;
      observer.observe(el);
    });
  }
  revealAll();

  /* ----------------------------------------------------------------------
     header height → CSS variable (keeps sticky offsets honest)
     ---------------------------------------------------------------------- */
  var header = $('[data-header]');
  if (header) {
    var setHeaderHeight = function () {
      document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
    };
    setHeaderHeight();
    window.addEventListener('resize', debounce(setHeaderHeight, 150));
  }

  /* ----------------------------------------------------------------------
     Cash-on-delivery order form
     Four required fields, one press: we mint a reference, write the whole
     order into a single WhatsApp message and hand it over. Nothing is
     posted anywhere — the conversation is the order.
     ---------------------------------------------------------------------- */
  function initOrderForm() {
    var form = $('[data-order-form]');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    var done = $('[data-order-done]');
    var errBox = form.querySelector('[data-order-error]');
    var totalEl = form.querySelector('[data-order-total]');
    var submitBtn = form.querySelector('[data-order-submit]');
    var label = form.querySelector('[data-order-label]');
    var labelIdle = label ? label.textContent : '';
    var unit = parseInt(form.dataset.unit, 10) || 0;
    var qtyInput = $('[data-qty] input[name="quantity"]');

    function qty() {
      var n = parseInt(qtyInput && qtyInput.value, 10);
      return n > 0 ? Math.min(n, 20) : 1;
    }
    function paintTotal() { if (totalEl) totalEl.textContent = formatMoney(unit * qty()); }
    paintTotal();
    if (qtyInput) on(qtyInput, 'change', paintTotal);
    on(document, 'click', function (e) {
      if (e.target.closest('[data-qty-up], [data-qty-down]')) setTimeout(paintTotal, 0);
    });

    // The same rule the storefront API enforces, so a number accepted here is
    // accepted there too.
    function normalisePhone(raw) {
      var v = String(raw || '').replace(/[\s.\-()]/g, '');
      var m = v.match(/^(?:\+212|00212|0)([5-7]\d{8})$/);
      return m ? '+212' + m[1] : null;
    }

    // EL + base36 clock + two digits: the shape the storefront mints.
    function reference() {
      var stamp = Date.now().toString(36).toUpperCase().slice(-6);
      return 'EL' + stamp + String(Math.floor(Math.random() * 90 + 10));
    }

    function fail(message) {
      if (!errBox) return;
      errBox.textContent = message;
      errBox.hidden = false;
      // Reaching a human is the difference between a lost sale and a late one.
      var errWa = form.querySelector('[data-order-err-wa]');
      if (errWa) errWa.hidden = false;
      if (errBox.scrollIntoView) errBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function busy(state) {
      if (submitBtn) submitBtn.disabled = state;
      if (label) label.textContent = state ? (strings.ordering || labelIdle) : labelIdle;
    }

    on(form, 'submit', function (e) {
      e.preventDefault();
      if (errBox) errBox.hidden = true;

      if (form.querySelector('[name="company"]').value) return;   // bot
      if (!form.reportValidity()) return;                          // required fields

      var phone = normalisePhone(form.querySelector('[name="phone"]').value);
      if (!phone) { fail(form.dataset.errPhone); return; }

      var n = qty();
      var citySel = form.querySelector('[name="city"]');
      var ref = reference();
      var payload = {
        // A theme has no server, so this is readable in page source. It is a
        // bot deterrent; the script must not rely on it as authentication.
        secret: form.dataset.secret || '',
        ref: ref,
        placedAt: new Date().toISOString(),
        name: form.querySelector('[name="name"]').value.trim(),
        phone: phone,
        // The option value is the Arabic city name whatever the shop language,
        // because the sheet's city column is a dropdown of Arabic names.
        city: citySel.value,
        address: form.querySelector('[name="address"]').value.trim(),
        product: form.dataset.product,
        items: form.dataset.product + ' [' + form.dataset.sku + '] × ' + n,
        quantity: n,
        subtotal: unit * n / 100,
        shipping: 0,
        total: unit * n / 100,
        currency: form.dataset.currency,
        locale: document.documentElement.lang || '',
        source: 'theme'
      };

      busy(true);
      // text/plain is a "simple" content type, so the browser sends no CORS
      // preflight — which Apps Script handles poorly. The script parses the
      // body itself, so the header costs nothing.
      fetch(form.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      })
        .then(function (res) {
          if (!res.ok) throw new Error('http ' + res.status);
          return res.text();
        })
        .then(function (text) {
          try {
            var data = JSON.parse(text);
            if (data && data.ok === false) throw new Error(data.error || 'script');
          } catch (err) {
            if (err && err.message && err.message !== 'script') { /* not JSON: treat as written */ }
            else if (err) throw err;
          }
          if (!done) return;
          var codeEl = done.querySelector('[data-order-ref]');
          if (codeEl) codeEl.textContent = ref;
          var waEl = done.querySelector('[data-order-wa]');
          if (waEl && waEl.getAttribute('data-wa-base')) {
            var waMsg = (waEl.getAttribute('data-wa-msg') || '').replace('__REF__', ref);
            waEl.href = waEl.getAttribute('data-wa-base') + '?text=' + encodeURIComponent(waMsg);
          }
          form.hidden = true;
          done.hidden = false;
          if (done.scrollIntoView) done.scrollIntoView({ block: 'center', behavior: 'smooth' });
        })
        .catch(function () {
          busy(false);
          fail(form.dataset.errSend);
        });
    });
  }

  /* ----------------------------------------------------------------------
     product inquiry — a question, never an order
     ---------------------------------------------------------------------- */
  function initInquiryForm() {
    var root = $('[data-inquiry]');
    var form = $('[data-inquiry-form]');
    if (!root || !form || form.dataset.bound) return;
    form.dataset.bound = '1';

    var done = $('[data-inquiry-done]');
    var errBox = form.querySelector('[data-inquiry-error]');
    var submitBtn = form.querySelector('[data-inquiry-submit]');
    var label = form.querySelector('[data-inquiry-label]');
    var labelIdle = label ? label.textContent : '';
    var openedAt = 0;

    function open() {
      root.hidden = false;
      document.body.style.overflow = 'hidden';
      openedAt = Date.now();
      var first = form.querySelector('input[name="name"]');
      if (first) first.focus();
    }
    function close() {
      root.hidden = true;
      document.body.style.overflow = '';
    }

    on(document, 'click', function (e) {
      if (e.target.closest('[data-inquiry-open]')) { e.preventDefault(); open(); }
      else if (e.target.closest('[data-inquiry-close]')) { e.preventDefault(); close(); }
    });
    on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && !root.hidden) close();
    });

    function normalisePhone(raw) {
      var v = String(raw || '').replace(/[\s.\-()]/g, '');
      var m = v.match(/^(?:\+212|00212|0)([5-7]\d{8})$/);
      return m ? '+212' + m[1] : null;
    }

    function fail(message) {
      if (!errBox) return;
      errBox.textContent = message;
      errBox.hidden = false;
    }

    on(form, 'submit', function (e) {
      e.preventDefault();
      if (errBox) errBox.hidden = true;

      if (form.querySelector('[name="company"]').value) return;          // bot
      if (Date.now() - openedAt < 1200) return;                          // too fast
      if (!form.reportValidity()) return;

      var phone = normalisePhone(form.querySelector('[name="phone"]').value);
      if (!phone) { fail(form.dataset.errPhone); return; }

      var ref = 'IQ' + Date.now().toString(36).toUpperCase().slice(-6) +
        String(Math.floor(Math.random() * 90 + 10));
      var pref = form.querySelector('[name="contactPref"]:checked');

      var payload = {
        kind: 'inquiry',
        ref: ref,
        placedAt: new Date().toISOString(),
        name: form.querySelector('[name="name"]').value.trim(),
        phone: phone,
        city: form.querySelector('[name="city"]').value,
        email: form.querySelector('[name="email"]').value.trim(),
        productName: form.dataset.product,
        productUrl: form.dataset.url,
        productRef: form.dataset.sku + ' / ' + form.dataset.productId,
        quantity: parseInt(form.querySelector('[name="quantity"]').value, 10) || 1,
        message: form.querySelector('[name="message"]').value.trim(),
        contactPref: pref ? pref.value : 'phone',
        status: 'new',
        locale: document.documentElement.lang || '',
        source: 'theme'
      };

      if (submitBtn) submitBtn.disabled = true;
      if (label) label.textContent = strings.ordering || labelIdle;

      // text/plain keeps this a "simple" request, so no CORS preflight.
      fetch(form.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      })
        .then(function (res) {
          if (!res.ok) throw new Error('http ' + res.status);
          return res.text();
        })
        .then(function (text) {
          try {
            var data = JSON.parse(text);
            if (data && data.ok === false) throw new Error(data.error || 'script');
          } catch (err) {
            if (err && err.message === 'script') throw err;
          }
          // The theme has no database of its own: the sheet is the only record,
          // so we only say "received" once it has actually answered.
          if (!done) return;
          var codeEl = done.querySelector('[data-inquiry-ref]');
          if (codeEl) codeEl.textContent = ref;
          form.hidden = true;
          done.hidden = false;
        })
        .catch(function () {
          if (submitBtn) submitBtn.disabled = false;
          if (label) label.textContent = labelIdle;
          fail(form.dataset.errSend);
        });
    });
  }
  initOrderForm();
  initInquiryForm();


  /* ----------------------------------------------------------------------
     Shopify theme editor hooks
     ---------------------------------------------------------------------- */
  document.addEventListener('shopify:section:load', function () { revealAll(); initCardScroll(); initOrderForm(); initInquiryForm(); });
  document.addEventListener('shopify:section:select', function (e) {
    var drawer = e.target.querySelector('.drawer');
    if (drawer) openPanel(drawer);
  });
})();
