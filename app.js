/* A local, dependency-free photo album. No photographs leave this page. */
(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const ui = {
    grid: byId('chapter-grid'), filters: byId('chapter-filter'), strip: byId('little-strip'),
    status: byId('site-status'), retry: byId('retry-load'), dialog: byId('photo-viewer'),
    title: byId('viewer-title'), count: byId('viewer-count'), image: byId('viewer-image'),
    variants: byId('viewer-variants'), thumbs: byId('viewer-thumbs'),
    previous: byId('viewer-prev'), next: byId('viewer-next'), close: byId('viewer-close'),
    download: byId('viewer-download'), favorite: byId('viewer-favorite'),
    viewerStatus: byId('viewer-status'),
  };
  const state = {
    catalog: null, photos: new Map(), groups: new Map(), filter: 'all',
    sequence: [], index: 0, version: 'original', scope: 'all', opener: null,
    previousOverflow: '', loading: false, favorites: new Set(),
  };
  const favoriteStorageKey = 'our-little-album:favorites:v1';
  let diagnostics = Object.freeze({ loaded: false, selected: null });
  let imageRequest = 0;

  Object.defineProperty(window, '__albumDiagnostics', {
    configurable: true, enumerable: false, get: () => diagnostics,
  });

  try {
    const saved = JSON.parse(localStorage.getItem(favoriteStorageKey) || '[]');
    if (Array.isArray(saved)) state.favorites = new Set(saved.filter((id) => typeof id === 'string'));
  } catch { /* The album also works when storage is unavailable. */ }

  function report(message) {
    if (ui.status) ui.status.textContent = message;
  }

  function frameWord(count) {
    const lastTwo = count % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return 'кадров';
    return count % 10 === 1 ? 'кадр' : count % 10 >= 2 && count % 10 <= 4 ? 'кадра' : 'кадров';
  }

  function allVersions(photo) {
    return [{ ...photo.original, id: 'original', label: 'Оригинал' }, ...photo.variants];
  }

  function selectedPhoto() {
    return state.photos.get(state.sequence[state.index]);
  }

  function selectedVersion(photo = selectedPhoto()) {
    return allVersions(photo).find((version) => version.id === state.version) || allVersions(photo)[0];
  }

  function updateDiagnostics() {
    const catalog = state.catalog;
    if (!catalog) return;
    const generated = catalog.photos.reduce((total, photo) => total + photo.variants.length, 0);
    diagnostics = Object.freeze({
      loaded: true,
      counts: Object.freeze({ originals: catalog.photos.length, generated, groups: catalog.groups.length,
        totalImages: catalog.photos.length + generated }),
      photoIds: Object.freeze(catalog.photos.map((photo) => photo.id)),
      photos: Object.freeze(catalog.photos.map((photo) => Object.freeze({
        id: photo.id, groupId: photo.groupId,
        versions: Object.freeze(['original', ...photo.variants.map((version) => version.id)]),
      }))),
      groups: Object.freeze(catalog.groups.map((group) => Object.freeze({
        id: group.id, photoIds: Object.freeze([...group.photoIds]),
      }))),
      filter: state.filter,
      selected: ui.dialog?.open ? Object.freeze({ photoId: state.sequence[state.index],
        version: state.version, scope: state.scope, index: state.index, total: state.sequence.length }) : null,
    });
  }

  function createImage(photo, version = photo.original, eager = false) {
    const image = document.createElement('img');
    image.src = version.src;
    image.alt = `${state.groups.get(photo.groupId)?.title || 'Наши моменты'} — ${version.label || 'оригинал'}`;
    image.width = version.width || photo.width;
    image.height = version.height || photo.height;
    image.loading = eager ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    return image;
  }

  function groupSelections(group) {
    const photos = group.photoIds.map((id) => state.photos.get(id)).filter(Boolean);
    const cover = state.photos.get(group.coverId) || photos[0];
    const next = photos.find((photo) => photo.id !== cover.id) || cover;
    const last = photos.findLast ? photos.findLast((photo) => photo.id !== cover.id && photo.id !== next.id)
      : [...photos].reverse().find((photo) => photo.id !== cover.id && photo.id !== next.id);
    const peek = last || cover;
    const coverVersion = group.id === 'tribunes'
      ? cover.variants.find((version) => version.id === 'a') || cover.original
      : cover.original;
    return [
      { photo: cover, version: coverVersion },
      { photo: next, version: next.variants[0] || next.original },
      { photo: peek, version: peek.variants[1] || peek.variants[0] || peek.original },
    ];
  }

  function renderChapters() {
    if (!ui.grid) return;
    ui.grid.classList.toggle('is-filtered', state.filter !== 'all');
    const fragment = document.createDocumentFragment();
    state.catalog.groups.forEach((group, index) => {
      if (state.filter !== 'all' && group.id !== state.filter) return;
      const article = document.createElement('article');
      article.className = `chapter ${index % 3 === 0 ? 'chapter--wide' : 'chapter--tall'}`;
      article.dataset.group = group.id;
      const hit = document.createElement('button');
      hit.type = 'button';
      hit.className = 'chapter-hit';
      hit.dataset.openGroup = group.id;
      const selections = groupSelections(group);
      hit.dataset.openVersion = selections[0].version.id || 'original';
      hit.setAttribute('aria-label', `${group.title}, ${group.photoIds.length} ${frameWord(group.photoIds.length)}. Открыть`);
      const collage = document.createElement('span');
      collage.className = 'chapter-collage';
      const positions = ['main', 'back', 'peek'];
      selections.forEach(({ photo, version }, position) => {
        const frame = document.createElement('span');
        frame.className = `chapter-photo chapter-photo--${positions[position]}`;
        const image = createImage(photo, version);
        image.alt = '';
        frame.append(image);
        collage.append(frame);
      });
      const caption = document.createElement('div');
      caption.className = 'chapter-caption';
      const title = document.createElement('h3');
      title.className = 'chapter-title';
      title.textContent = group.title;
      const count = document.createElement('span');
      count.className = 'chapter-count';
      count.textContent = `${group.photoIds.length} ${frameWord(group.photoIds.length)}`;
      const arrow = document.createElement('span');
      arrow.className = 'chapter-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';
      caption.append(title, count, arrow);
      hit.append(collage);
      article.append(hit, caption);
      fragment.append(article);
    });
    ui.grid.replaceChildren(fragment);
  }

  function renderFilters() {
    if (!ui.filters) return;
    const groups = [{ id: 'all', title: 'Всё вместе' }, ...state.catalog.groups];
    ui.filters.replaceChildren(...groups.map((group) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-button';
      button.dataset.filter = group.id;
      button.textContent = group.title;
      button.setAttribute('aria-pressed', String(group.id === state.filter));
      button.classList.toggle('is-active', group.id === state.filter);
      return button;
    }));
  }

  function renderStrip() {
    if (!ui.strip) return;
    const chosen = state.catalog.groups.map((group, index) => {
      const photo = state.photos.get(group.coverId) || state.photos.get(group.photoIds[0]);
      return { photo, version: allVersions(photo)[index % allVersions(photo).length] };
    });
    const used = new Set(chosen.map(({ photo }) => photo.id));
    for (const photo of state.catalog.photos) {
      if (chosen.length >= 10) break;
      if (!used.has(photo.id)) chosen.push({ photo, version: photo.original });
    }
    ui.strip.replaceChildren(...chosen.map(({ photo, version }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'little-frame';
      button.dataset.openPhoto = photo.id;
      button.dataset.openVersion = version.id || 'original';
      button.setAttribute('aria-label', `Открыть: ${state.groups.get(photo.groupId)?.title}, ${version.label || 'оригинал'}`);
      const image = createImage(photo, version);
      image.alt = '';
      button.append(image);
      return button;
    }));
  }

  function setHero(id, photoId, versionId) {
    const image = byId(id);
    const photo = state.photos.get(photoId) || state.catalog.photos[0];
    if (!image || !photo) return;
    const version = allVersions(photo).find((item) => item.id === versionId) || allVersions(photo)[0];
    image.src = version.src;
    image.width = version.width || photo.width;
    image.height = version.height || photo.height;
    image.alt = state.groups.get(photo.groupId)?.title || 'Мы вдвоём';
    image.draggable = false;
    const trigger = image.closest('[data-open-photo]');
    if (trigger) {
      trigger.dataset.openPhoto = photo.id;
      trigger.dataset.openVersion = version.id;
    }
  }

  function renderVariantControls(photo) {
    if (!ui.variants) return;
    const focusedVersion = ui.variants.contains(document.activeElement) ? document.activeElement.dataset.version : null;
    if (ui.variants.dataset.photo !== photo.id) {
      ui.variants.dataset.photo = photo.id;
      ui.variants.replaceChildren(...allVersions(photo).map((version) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'variant-button';
        button.dataset.version = version.id;
        button.textContent = version.label || (version.id === 'a' ? 'Кино' : version.id === 'b' ? 'Фантазия' : 'Ещё версия');
        return button;
      }));
    }
    for (const button of ui.variants.querySelectorAll('[data-version]')) {
      const active = button.dataset.version === state.version;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    if (focusedVersion) {
      const buttons = [...ui.variants.querySelectorAll('[data-version]')];
      (buttons.find((button) => button.dataset.version === focusedVersion) || buttons[0])?.focus({ preventScroll: true });
    }
  }

  function renderViewerThumbs() {
    if (!ui.thumbs) return;
    const key = state.sequence.join('|');
    if (ui.thumbs.dataset.sequence !== key) {
      ui.thumbs.dataset.sequence = key;
      ui.thumbs.replaceChildren(...state.sequence.map((id, index) => {
        const photo = state.photos.get(id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'viewer-thumb';
        button.dataset.photoIndex = String(index);
        button.setAttribute('aria-label', `Кадр ${index + 1}: ${state.groups.get(photo.groupId)?.title}`);
        const image = createImage(photo);
        image.alt = '';
        button.append(image);
        return button;
      }));
    }
    ui.thumbs.querySelectorAll('[data-photo-index]').forEach((button) => {
      const active = Number(button.dataset.photoIndex) === state.index;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  function updateFavorite() {
    if (!ui.favorite) return;
    const active = state.favorites.has(`${state.sequence[state.index]}:${state.version}`);
    ui.favorite.setAttribute('aria-pressed', String(active));
    ui.favorite.setAttribute('aria-label', active ? 'Убрать из любимых' : 'В любимые');
    ui.favorite.classList.toggle('is-favorite', active);
  }

  function renderViewer() {
    const photo = selectedPhoto();
    if (!photo) return;
    const version = selectedVersion(photo);
    state.version = version.id;
    if (ui.title) ui.title.textContent = state.scope === 'all' ? 'Наши моменты' : state.groups.get(photo.groupId)?.title || 'Мы';
    if (ui.count) ui.count.textContent = `${state.index + 1} / ${state.sequence.length}`;
    renderVariantControls(photo);
    renderViewerThumbs();
    updateFavorite();
    if (ui.previous) ui.previous.disabled = state.sequence.length < 2;
    if (ui.next) ui.next.disabled = state.sequence.length < 2;
    if (ui.download) {
      ui.download.href = version.full || version.src;
      const extension = (version.full || version.src).split('?')[0].split('.').pop() || 'jpg';
      ui.download.download = `${photo.id}-${version.id}.${extension}`;
      ui.download.setAttribute('aria-label', `Скачать: ${version.label}`);
    }
    if (ui.image) {
      const request = ++imageRequest;
      const media = ui.image.closest('.viewer-media') || ui.image.parentElement;
      media?.classList.add('is-loading');
      media?.classList.remove('has-error');
      media?.setAttribute('aria-busy', 'true');
      if (ui.viewerStatus) ui.viewerStatus.textContent = '';
      ui.image.onload = () => {
        if (request !== imageRequest) return;
        media?.classList.remove('is-loading');
        media?.setAttribute('aria-busy', 'false');
      };
      ui.image.onerror = () => {
        if (request !== imageRequest) return;
        media?.classList.remove('is-loading');
        media?.classList.add('has-error');
        media?.setAttribute('aria-busy', 'false');
        const message = 'Не удалось открыть фото. Попробуйте другую версию.';
        if (ui.viewerStatus) ui.viewerStatus.textContent = message;
        report(message);
      };
      ui.image.alt = `${state.groups.get(photo.groupId)?.title || 'Наш момент'} — ${version.label}`;
      ui.image.width = version.width || photo.width;
      ui.image.height = version.height || photo.height;
      ui.image.src = version.full || version.src;
    }
    updateDiagnostics();
  }

  function openViewer(photoId, versionId = 'original', scope = null, opener = document.activeElement) {
    if (!state.catalog || !ui.dialog) return;
    const photo = state.photos.get(photoId) || state.catalog.photos[0];
    const group = state.groups.get(scope || photo.groupId);
    state.scope = scope === 'all' ? 'all' : group?.id || 'all';
    state.sequence = state.scope === 'all' ? state.catalog.photos.map((item) => item.id) : [...group.photoIds];
    state.index = Math.max(0, state.sequence.indexOf(photo.id));
    state.version = versionId;
    const alreadyOpen = ui.dialog.open;
    if (!alreadyOpen) state.opener = opener instanceof HTMLElement ? opener : null;
    renderViewer();
    if (!alreadyOpen) {
      state.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.classList.add('viewer-open');
      ui.dialog.showModal();
      ui.close?.focus({ preventScroll: true });
    }
    updateDiagnostics();
  }

  function navigate(delta) {
    if (!state.sequence.length) return;
    state.index = (state.index + delta + state.sequence.length) % state.sequence.length;
    renderViewer();
  }

  function bindInteractions() {
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const groupButton = target.closest('[data-open-group]');
      if (groupButton && state.catalog) {
        const group = state.groups.get(groupButton.dataset.openGroup);
        if (group) openViewer(group.coverId || group.photoIds[0], groupButton.dataset.openVersion || 'original', group.id, groupButton);
        return;
      }
      const photoButton = target.closest('[data-open-photo]');
      if (photoButton) openViewer(photoButton.dataset.openPhoto, photoButton.dataset.openVersion || 'original', null, photoButton);
    });

    ui.filters?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button || !state.catalog) return;
      state.filter = button.dataset.filter;
      ui.filters.querySelectorAll('[data-filter]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      renderChapters();
      updateDiagnostics();
    });

    byId('view-all')?.addEventListener('click', (event) => {
      if (state.catalog) openViewer(state.catalog.photos[0].id, 'original', 'all', event.currentTarget);
    });
    byId('random-moment')?.addEventListener('click', (event) => {
      if (!state.catalog) return;
      const choices = state.catalog.photos.flatMap((photo) => allVersions(photo).map((version) => ({ photo, version })));
      const selected = choices[Math.floor(Math.random() * choices.length)];
      openViewer(selected.photo.id, selected.version.id, null, event.currentTarget);
    });
    ui.previous?.addEventListener('click', () => navigate(-1));
    ui.next?.addEventListener('click', () => navigate(1));
    ui.close?.addEventListener('click', () => ui.dialog?.close());
    ui.variants?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-version]');
      if (!button) return;
      state.version = button.dataset.version;
      renderViewer();
    });
    ui.thumbs?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-photo-index]');
      if (!button) return;
      state.index = Number(button.dataset.photoIndex);
      renderViewer();
    });
    ui.favorite?.addEventListener('click', () => {
      const key = `${state.sequence[state.index]}:${state.version}`;
      if (state.favorites.has(key)) state.favorites.delete(key);
      else state.favorites.add(key);
      try { localStorage.setItem(favoriteStorageKey, JSON.stringify([...state.favorites])); } catch { /* Optional persistence. */ }
      updateFavorite();
    });

    if (ui.dialog) {
      ui.dialog.setAttribute('closedby', 'any');
      ui.dialog.addEventListener('close', () => {
        document.body.style.overflow = state.previousOverflow;
        document.body.classList.remove('viewer-open');
        updateDiagnostics();
        if (state.opener?.isConnected) state.opener.focus({ preventScroll: true });
      });
      ui.dialog.addEventListener('keydown', (event) => {
        if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          navigate(event.key === 'ArrowRight' ? 1 : -1);
        }
      });
      if (!('closedBy' in HTMLDialogElement.prototype)) {
        ui.dialog.addEventListener('click', (event) => {
          if (event.target !== ui.dialog) return;
          const rect = ui.dialog.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) ui.dialog.close();
        });
      }
    }

    if (ui.image) {
      let swipe = null;
      ui.image.draggable = false;
      // Let vertical gestures scroll naturally while horizontal gestures turn a page.
      ui.image.style.touchAction = 'pan-y';
      ui.image.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' || !event.isPrimary) return;
        swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
      });
      ui.image.addEventListener('pointerup', (event) => {
        if (!swipe || swipe.id !== event.pointerId) return;
        const deltaX = event.clientX - swipe.x;
        const deltaY = event.clientY - swipe.y;
        swipe = null;
        if (Math.abs(deltaX) >= 56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) navigate(deltaX < 0 ? 1 : -1);
      });
      ui.image.addEventListener('pointercancel', () => { swipe = null; });
      if (!ui.viewerStatus) {
        ui.viewerStatus = document.createElement('span');
        ui.viewerStatus.className = 'viewer-status';
        ui.viewerStatus.setAttribute('role', 'status');
        ui.viewerStatus.setAttribute('aria-live', 'polite');
        ui.image.parentElement?.append(ui.viewerStatus);
      }
    }
  }

  function validateCatalog(catalog) {
    if (!catalog || !Array.isArray(catalog.photos) || !catalog.photos.length || !Array.isArray(catalog.groups) || !catalog.groups.length) throw new Error('Empty catalog');
    const ids = new Set();
    for (const photo of catalog.photos) {
      if (!photo.id || ids.has(photo.id) || !photo.original?.src || !Array.isArray(photo.variants) || photo.variants.some((version) => !version.id || !version.src)) throw new Error('Invalid photo');
      ids.add(photo.id);
    }
    const grouped = new Set();
    for (const group of catalog.groups) {
      if (!group.id || !Array.isArray(group.photoIds) || !group.photoIds.length || group.photoIds.some((id) => !ids.has(id))) throw new Error('Invalid group');
      group.photoIds.forEach((id) => grouped.add(id));
    }
    if (grouped.size !== ids.size) throw new Error('Ungrouped photo');
    return catalog;
  }

  async function loadCatalog() {
    if (state.loading) return;
    state.loading = true;
    if (ui.retry) ui.retry.hidden = true;
    report('Загружаем наши моменты…');
    try {
      const response = await fetch('./catalog.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
      state.catalog = validateCatalog(await response.json());
      state.photos = new Map(state.catalog.photos.map((photo) => [photo.id, photo]));
      state.groups = new Map(state.catalog.groups.map((group) => [group.id, group]));
      state.filter = 'all';
      renderFilters();
      renderChapters();
      renderStrip();
      setHero('hero-main', 'photo-20', 'original');
      setHero('hero-side', 'photo-05', 'b');
      setHero('hero-small', 'photo-07', 'original');
      const generated = state.catalog.photos.reduce((total, photo) => total + photo.variants.length, 0);
      [['photo-total', state.catalog.photos.length], ['version-total', generated], ['group-total', state.catalog.groups.length]]
        .forEach(([id, count]) => { if (byId(id)) byId(id).textContent = String(count); });
      report('');
      document.documentElement.classList.add('album-ready');
      updateDiagnostics();
      window.dispatchEvent(new CustomEvent('album:ready', { detail: diagnostics }));
    } catch (error) {
      report(location.protocol === 'file:' ? 'Откройте сайт по локальной ссылке, чтобы загрузить фотографии.' : 'Фотографии пока не загрузились. Попробуем ещё раз?');
      if (!ui.retry && ui.status?.parentElement) {
        ui.retry = document.createElement('button');
        ui.retry.type = 'button';
        ui.retry.className = 'retry-button';
        ui.retry.textContent = 'Повторить';
        ui.retry.addEventListener('click', loadCatalog);
        ui.status.after(ui.retry);
      }
      if (ui.retry) ui.retry.hidden = false;
      diagnostics = Object.freeze({ loaded: false, error: 'catalog-unavailable', selected: null });
    } finally {
      state.loading = false;
    }
  }

  bindInteractions();
  ui.retry?.addEventListener('click', loadCatalog);
  loadCatalog();
})();
