import fs from 'fs'
import path from 'path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';


const CONFIG = {
  clicks: {
    maxPerAd: 1,
    maxAdsPerSearch: 5,
    waitAfterClick: { min: 6000, max: 10000 },
    waitBetweenAds: { min: 2000, max: 4000 }
  },
    
  target: {
    mustContainInTitle: '',
    mustContainInUrl: '',
    detectKeywords: ['Banco santiago del estero', 'santafe online']
  },
  
  blacklist: {
    urls: [
  ''
    ],
    titles: [
   ''
    ],
    domains: []
  },
  
  whitelist: {
    enabled: false,
    urls: [],
    titles: []
  },

  search: {
    attemptsPerProvince: 9,
    waitBetweenAttempts: { min: 3000, max: 5000 },
    waitBetweenProvinces: { min: 10000, max: 15000 }
  },
  
  navigation: {
    searchTimeout: 30000,
    pageTimeout: 45000,
    selectorTimeout: 10000
  },
  
  behavior: {
    mobileChance: 0.2,
    jitterRadius: 0.2
  }
};

const TEXTS = {
  worker: {
    starting: (id) => `Worker ${id} iniciando`,
    failed: (id, msg) => `Worker ${id} fallo: ${msg}`,
    countryLoaded: (name, count) => `Pais cargado: ${name} (${count} regiones)`
  },
  
  search: {
    mode: (mode, province) => `Modo: ${mode} | Provincia: ${province}`,
    attempt: (current, max, location) => `Intento ${current}/${max} | Ubicacion: ${location}`,
    query: (q) => `Buscando: "${q}"`,
    done: 'Busqueda realizada',
    noAds: 'Sin anuncios en esta ubicacion'
  },
  
  ads: {
    found: (count) => `Encontrados ${count} anuncios`,
    visiting: (index, total, title) => `[${index}/${total}] Visitando: ${title}`,
    notFound: (title) => `No se encontro el enlace para: ${title}`,
    skippedBlacklist: (title) => `Omitido (blacklist): ${title}`,
    skippedWhitelist: (title) => `Omitido (no en whitelist): ${title}`,
    clicked: (url) => `Click realizado: ${url}`,
    pageLoaded: (url) => `Pagina cargada: ${url}`
  },
  
  navigation: {
    toGoogle: (country) => `Navegando a Google (${country})`,
    cookiesAccepted: 'Cookies aceptadas',
    redirectFailed: 'No se pudo seguir la redireccion',
    tabClosed: 'Pestana cerrada. Preparando nueva busqueda...',
    closingTab: 'Cerrando pestana actual para nueva busqueda...'
  },
  
  captcha: {
    detected: 'CAPTCHA detectado. Resolver manualmente...',
    solved: 'CAPTCHA resuelto manualmente'
  },
  
  detection: {
    found: (keyword, title) => `DETECTADO ${keyword}! Titulo: "${title}"`,
    title: (title) => `Titulo: "${title}"`
  },
  
  province: {
    maxAttempts: (attempts, name) => `No se encontraron anuncios en ${attempts} intentos en ${name}`,
    cycleComplete: 'Ciclo de provincia completado. Cambiando provincia...'
  },
  
  errors: {
    page: (msg) => `Error en la pagina: ${msg}`,
    attempt: (num, msg) => `Error en intento ${num}: ${msg}`,
    critical: (msg) => `Error critico: ${msg}`,
    geoLoad: (code, msg) => `No se pudo cargar datos para ${code}: ${msg}`,
    proxyFormat: (str) => `Proxy con formato incorrecto: ${str}`,
    proxyAuth: 'Error autenticando proxy'
  },
  
  proxy: {
    configured: 'Proxy configurado con sesion rotativa'
  },
  
  browser: {
    openForInspection: 'Navegador abierto para inspeccion manual',
    closeWhenDone: 'Cierra la ventana cuando termines'
  }
};

const FALLBACK_UAS = {
  desktop: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  ],
  mobile: [
    'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ]
};

const DEFAULT_GEO = {
  country: 'AR',
  name: 'Argentina',
  defaultLang: 'es-AR',
  googleUrl: 'https://www.google.com/search',
  defaultTz: 'America/Argentina/Buenos_Aires',
  regions: [
    {
      name: "Buenos Aires",
      tz: "America/Argentina/Buenos_Aires",
      lat: -34.6037,
      lng: -58.3816,
      coords: [{ label: "centro", lat: -34.6037, lng: -58.3816 }]
    }
  ]
};

const ICONS = {
  worker: '👷',
  map: '🗺️',
  location: '📍',
  globe: '🌐',
  cookie: '🍪',
  search: '🔍',
  check: '✅',
  shield: '🛡️',
  mouse: '🖱️',
  page: '📥',
  target: '🎯',
  document: '📄',
  recycle: '🔄',
  error: '💥',
  warning: '⚠️',
  lock: '🔐',
  money: '💰',
  tab: '📑',
  skip: '⏭️',
  click: '👆'
};

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

const tempProfilesDir = path.join(process.cwd(), 'temp_profiles');
if (!fs.existsSync(tempProfilesDir)) {
  fs.mkdirSync(tempProfilesDir, { recursive: true });
}

puppeteer.use(StealthPlugin());

const seqIndexByProvince = new Map();

function removerAcentos(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getRandomUA(isMobile = false) {
  const list = isMobile ? FALLBACK_UAS.mobile : FALLBACK_UAS.desktop;
  return list[Math.floor(Math.random() * list.length)];
}

function getHostname(url) {
  try {
    if (url.includes('/aclk?') || url.includes('/url?')) {
      const urlObj = new URL(url);
      const adurl = urlObj.searchParams.get('adurl') || urlObj.searchParams.get('q');
      if (adurl) {
        return new URL(adurl).hostname.replace(/^www\./, '');
      }
    }
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.substring(0, 20); 
  }
}

function getAdIdentifier(ad, index) {
  const titlePart = ad.title.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '');
  return `${index}_${titlePart}`;
}

 

function getGoogleUrl(geoData) {
  return geoData.googleUrl || 'https://www.google.com/search';
}

async function smartWait(pageOrNull, min = 300, max = 800, { waitForSelector, timeout = 10000 } = {}) {
  const page = pageOrNull;
  if (page && waitForSelector) {
    try {
      await page.waitForSelector(waitForSelector, { visible: true, timeout });
    } catch (e) {}
  }
  await new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

function isBlacklisted(ad) {
  const urlLower = ad.href.toLowerCase();
  const titleLower = ad.title.toLowerCase();
  
  // ✅ PERMITIR URLs de redirección de Google Ads
  if (urlLower.includes('/aclk?') || urlLower.includes('/url?')) {
    return false;
  }
  
  for (const blockedUrl of CONFIG.blacklist.urls) {
    if (blockedUrl && urlLower.includes(blockedUrl.toLowerCase())) {
      return true;
    }
  }
  
  for (const blockedTitle of CONFIG.blacklist.titles) {
    if (blockedTitle && titleLower.includes(blockedTitle.toLowerCase())) {
      return true;
    }
  }
  
  for (const blockedDomain of CONFIG.blacklist.domains) {
    if (blockedDomain && urlLower.includes(blockedDomain.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

function isWhitelisted(ad) {
  if (!CONFIG.whitelist.enabled) return true;
  
  const urlLower = ad.href.toLowerCase();
  const titleLower = ad.title.toLowerCase();
  
  for (const allowedUrl of CONFIG.whitelist.urls) {
    if (urlLower.includes(allowedUrl.toLowerCase())) return true;
  }
  
  for (const allowedTitle of CONFIG.whitelist.titles) {
    if (titleLower.includes(allowedTitle.toLowerCase())) return true;
  }
  
  return false;
}

function shouldClickAd(ad) {
  if (isBlacklisted(ad)) return { click: false, reason: 'blacklist' };
  if (!isWhitelisted(ad)) return { click: false, reason: 'whitelist' };
  return { click: true, reason: 'ok' };
}

async function loadCountryGeo(countryCode) {
  const geoPath = path.join(process.cwd(), 'geo', `${countryCode.toUpperCase()}.json`);
  try {
    const data = await fs.promises.readFile(geoPath, 'utf-8');
    const geo = JSON.parse(data);

    if (geo.regions) {
      geo.regions = geo.regions.map(region => {
        if (!region.lat && region.coords && region.coords.length > 0) {
          region.lat = region.coords[0].lat;
        }
        if (!region.lng && region.coords && region.coords.length > 0) {
          region.lng = region.coords[0].lng;
        }
        return region;
      });
    }

    return geo;
  } catch (error) {
    console.log(TEXTS.errors.geoLoad(countryCode, error.message));
    return { ...DEFAULT_GEO, country: countryCode, name: countryCode };
  }
}

function pickProvince(regions, mode, provinceName) {
  if (!regions || regions.length === 0) {
    return DEFAULT_GEO.regions[0];
  }

  if (mode === 'fixed' && provinceName) {
    const nombreLimpio = removerAcentos(provinceName.toLowerCase());
    const found = regions.find(p =>
      removerAcentos(p.name.toLowerCase()) === nombreLimpio ||
      removerAcentos(p.name.toLowerCase()).includes(nombreLimpio)
    );
    if (found) return found;
  }

  return regions[Math.floor(Math.random() * regions.length)];
}

function pickCoord(province, coordMode = 'random') {
  if (!province.coords || province.coords.length === 0) {
    const center = { lat: province.lat || DEFAULT_GEO.regions[0].lat, lng: province.lng || DEFAULT_GEO.regions[0].lng };
    return jitterAround(center, CONFIG.behavior.jitterRadius);
  }

  if (coordMode === 'random') {
    return province.coords[Math.floor(Math.random() * province.coords.length)];
  }

  if (coordMode === 'sequential') {
    const key = province.name;
    const i = (seqIndexByProvince.get(key) || 0) % province.coords.length;
    seqIndexByProvince.set(key, i + 1);
    return province.coords[i];
  }

  if (coordMode === 'weighted') {
    const total = province.coords.reduce((s, c) => s + (c.weight || 1), 0);
    let r = Math.random() * total;
    for (const c of province.coords) {
      r -= (c.weight || 1);
      if (r <= 0) return c;
    }
  }

  return province.coords[Math.floor(Math.random() * province.coords.length)];
}

function jitterAround({ lat, lng }, degRadius = 0.1) {
  const u = Math.random();
  const v = Math.random();
  const r = degRadius * Math.sqrt(u);
  const theta = 2 * Math.PI * v;
  const dLat = r * Math.cos(theta);
  const dLng = r * Math.sin(theta);

  return { lat: lat + dLat, lng: lng + dLng, label: 'aleatorio' };
}

function parseProxy(proxyStr) {
  if (!proxyStr) return null;
  try {
    let host, port, username, password;
    if (proxyStr.includes('@')) {
      const [auth, server] = proxyStr.split('@');
      [username, password] = auth.split(':');
      [host, port] = server.split(':');
    } else {
      [host, port, username, password] = proxyStr.split(':');
    }
    return { server: `http://${host}:${port}`, username, password };
  } catch (e) {
    console.log(TEXTS.errors.proxyFormat(proxyStr));
    return null;
  }
}
 
function setupLogger() {
  const QUIET = process.env.QUIET === '1' || process.env.QUIET === 'true';

  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString('es-AR', { hour12: false });
  };

  const formatMessage = (level, icon, message, data = null) => {
    const timestamp = getTimestamp();
    const cleanedMessage = removerAcentos(message);

    let color = COLORS.white;
    let levelText = 'INFO';

    switch(level) {
      case 'info': color = COLORS.cyan; levelText = 'INFO'; break;
      case 'warn': color = COLORS.yellow; levelText = 'AVISO'; break;
      case 'error': color = COLORS.red; levelText = 'ERROR'; break;
      case 'debug': color = COLORS.dim; levelText = 'DEBUG'; break;
      case 'success': color = COLORS.green; levelText = 'OK'; break;
    }

    let logLine = `${COLORS.dim}[${timestamp}]${COLORS.reset} ${icon} ${color}${levelText}:${COLORS.reset} ${cleanedMessage}`;

    if (data) {
      if (typeof data === 'object') {
        logLine += ` ${COLORS.dim}${JSON.stringify(data)}${COLORS.reset}`;
      } else {
        logLine += ` ${COLORS.dim}${data}${COLORS.reset}`;
      }
    }

    return logLine;
  };

  if (QUIET) {
    const noop = () => {};
    return {
      info: noop,
      warn: noop,
      error: console.error,
      debug: noop,
      success: noop,
      child: () => ({ info: noop, warn: noop, error: console.error, debug: noop, success: noop })
    };
  }

  const logger = {
    info: (message, data = null) => console.log(formatMessage('info', ICONS.map, message, data)),
    warn: (message, data = null) => console.log(formatMessage('warn', ICONS.warning, message, data)),
    error: (message, data = null) => console.log(formatMessage('error', ICONS.error, message, data)),
    debug: (message, data = null) => console.log(formatMessage('debug', '', message, data)),
    success: (message, data = null) => console.log(formatMessage('success', ICONS.check, message, data)),
    child: (bindings = {}) => ({
      info: (message, data = null) => logger.info(message, { ...bindings, ...data }),
      warn: (message, data = null) => logger.warn(message, { ...bindings, ...data }),
      error: (message, data = null) => logger.error(message, { ...bindings, ...data }),
      debug: (message, data = null) => logger.debug(message, { ...bindings, ...data }),
      success: (message, data = null) => logger.success(message, { ...bindings, ...data })
    })
  };

  return logger;
}

async function simulateHumanBehavior(page) {
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(200, 300, { steps: 10 });
  await page.mouse.up();
  await page.evaluate(() => window.scrollBy(0, Math.random() * 300 + 100));
  await smartWait(page, 1000, 2000);
}

class SearchController {
  constructor(browser, log, opts) {
    this.browser = browser;
    this.log = log;
    this.opts = opts;
    this.currentProvincia = null;
    // ❌ ELIMINADO: this.clickCount - ahora usamos contador local
  }

  async run() {
    while (true) {
      try {
        const provincia = pickProvince(this.opts.geo.regions, this.opts.mode, this.opts.province);
        this.currentProvincia = provincia;
        this.log.info(TEXTS.search.mode(this.opts.mode, provincia.name));

        let attempts = 0;
        const maxAttempts = CONFIG.search.attemptsPerProvince;

        while (attempts < maxAttempts) {
          try {
            const coord = pickCoord(provincia, this.opts.coordMode || 'random');
            this.currentCoord = coord;

            const ubicacion = coord.label ? coord.label : `${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)}`;
            this.log.info(`${ICONS.tab} ${TEXTS.search.attempt(attempts + 1, maxAttempts, ubicacion)}`);

            const page = await this.browser.newPage();
            try {
              await this._setupPage(page, provincia, coord);
              await this._navigateToGoogle(page);

              if (await this._handleCaptcha(page)) {
                this.log.success(TEXTS.captcha.solved);
                await smartWait(page, 2000, 4000);
              }

              await this._performSearch(page, this.opts.query);
              await page.waitForSelector('#search, #rso', { visible: true, timeout: CONFIG.navigation.searchTimeout });
              const ads = await this._collectSponsoredLinks(page);

              if (ads.length > 0) {
                this.log.success(TEXTS.ads.found(ads.length));
                await this._processAdsSequentially(page, ads);
                this.log.info(TEXTS.navigation.closingTab);
              } else {
                this.log.warn(TEXTS.search.noAds);
              }
            } catch (pageError) {
              this.log.error(TEXTS.errors.page(pageError.message));
            } finally {
              await page.close().catch(() => {});
              this.log.info(TEXTS.navigation.tabClosed);
            }

            attempts++;
            await smartWait(null, CONFIG.search.waitBetweenAttempts.min, CONFIG.search.waitBetweenAttempts.max);

          } catch (attemptError) {
            this.log.error(TEXTS.errors.attempt(attempts + 1, attemptError.message));
            attempts++;
            await smartWait(null, 5000, 8000);
          }
        }

        if (attempts >= maxAttempts) {
          this.log.warn(TEXTS.province.maxAttempts(maxAttempts, provincia.name));
        }

        this.log.info(TEXTS.province.cycleComplete);
        await smartWait(null, CONFIG.search.waitBetweenProvinces.min, CONFIG.search.waitBetweenProvinces.max);

      } catch (outer) {
        this.log.error(TEXTS.errors.critical(outer.message));
        await smartWait(null, 8000, 12000);
      }
    }
  }

  async _setupPage(page, provincia, coord) {
    const isMobile = Math.random() < CONFIG.behavior.mobileChance;
    const viewport = isMobile
      ? { width: 360, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { width: 1366, height: 768 };

    await page.setViewport(viewport);
    await page.setUserAgent(getRandomUA(isMobile));

    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      const resourceType = req.resourceType();
      if (/gstatic|googleapis|recaptcha|google\.com/.test(url)) return req.continue();
      if (['media', 'websocket', 'eventsource', 'manifest'].includes(resourceType)) return req.abort();
      req.continue();
    });

    const acceptLang = this.opts.lang?.startsWith('es') ? 'es-AR' : this.opts.lang || 'es-AR';
    await page.setExtraHTTPHeaders({
      'Accept-Language': `${acceptLang},${acceptLang.split('-')[0]};q=0.9,en;q=0.8`,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    });

    await page.evaluateOnNewDocument((prov, c) => {
      navigator.geolocation = {
        getCurrentPosition: (success) => success({
          coords: { latitude: c.lat, longitude: c.lng, accuracy: 20 },
          timestamp: Date.now()
        }),
        watchPosition: () => ({})
      };

      Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
        value: () => ({ timeZone: prov.tz || 'America/Argentina/Buenos_Aires' })
      });

      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['es-AR', 'es'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'mimeTypes', { get: () => ({ length: 0 }) });
      window.chrome = { runtime: {}, csi: () => {} };

      const originalQuery = navigator.permissions.query;
      navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' })
          : originalQuery(parameters);
    }, provincia, coord);

    await simulateHumanBehavior(page);
  }

  async _navigateToGoogle(page) {
    const googleUrl = getGoogleUrl(this.opts.geo);
    this.log.info(TEXTS.navigation.toGoogle(this.opts.geo.name || this.opts.country));
    await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigation.pageTimeout });

    try {
      await page.click('button[id="L2AGLb"]').catch(() => {});
      this.log.success(TEXTS.navigation.cookiesAccepted);
    } catch {}
  }

  async _handleCaptcha(page) {
    const isCaptcha = /sorry|recaptcha/i.test(page.url()) ||
      (await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return text.includes('trafico inusual') || text.includes('unusual traffic');
      }));
    if (!isCaptcha) return false;
    this.log.warn(TEXTS.captcha.detected);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    await new Promise(resolve => {
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        resolve();
      });
    });
    return true;
  }

  async _performSearch(page, query) {
    this.log.info(TEXTS.search.query(query));
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await page.waitForSelector('textarea[name="q"], input[name="q"]', { visible: true });
    await page.focus('textarea[name="q"], input[name="q"]');

    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');

    for (const char of query) {
      await page.keyboard.press(char);
      await smartWait(page, 80, 150);
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: CONFIG.navigation.searchTimeout }),
      page.keyboard.press('Enter')
    ]);

    this.log.success(TEXTS.search.done);

    await page.waitForSelector('#tads, #tvcap', { timeout: 20000 }).catch(() => {});
    await smartWait(page, 1000, 2000);
  }

  async _collectSponsoredLinks(page) {
    return await page.evaluate(() => {
      const results = new Set();

      const labels = Array.from(document.querySelectorAll('span, div'))
        .filter(el => ['Patrocinado', 'Sponsored'].includes(el.innerText.trim()));

      for (const label of labels) {
        let container = label.closest('div[data-hveid], g-inner-card, [data-text-ad="1"]');
        if (!container) container = label.parentElement?.parentElement?.parentElement;

        const titleEl = container?.querySelector('h3, .lKeYrd, .v7jaNc, .O45XLd');
        const linkEl = container?.querySelector('a[href^="http"]:not([href*="google"])');

        if (titleEl && linkEl) {
          results.add(JSON.stringify({
            title: titleEl.innerText.trim() || 'Sin titulo',
            href: linkEl.href
          }));
        }
      }

      const adLinks = document.querySelectorAll('#tads a[href*="/aclk?"]');
      for (const link of adLinks) {
        const titleEl = link.querySelector('h3, .lKeYrd, .v7jaNc') || link;
        results.add(JSON.stringify({
          title: titleEl.innerText.trim().substring(0, 100) || 'Sin titulo',
          href: link.href
        }));
      }

      const redirectLinks = Array.from(document.querySelectorAll('a[href*="/aclk?"]'))
        .filter(a => !a.href.includes('google.') && !a.href.includes('youtube.'));

      for (const a of redirectLinks) {
        const titleEl = a.querySelector('h3, .lKeYrd, .v7jaNc') || a;
        const title = titleEl.innerText.trim() || a.title || 'Sin titulo';
        results.add(JSON.stringify({ title, href: a.href }));
      }

      const aeBlocks = document.querySelectorAll('[data-ae="1"]');
      for (const block of aeBlocks) {
        const link = block.querySelector('a[href*="/aclk?"]');
        if (!link) continue;
        const titleEl = block.querySelector('h3, .lKeYrd, .v7jaNc');
        if (titleEl) {
          results.add(JSON.stringify({
            title: titleEl.innerText.trim(),
            href: link.href
          }));
        }
      }

      return Array.from(results).map(json => JSON.parse(json));
    });
  }


// ✅ MÉTODO _processAdsSequentially COMPLETO Y CORREGIDO
async _processAdsSequentially(page, ads) {
  const clickCountThisSearch = new Map();
  const adsToProcess = ads.slice(0, CONFIG.clicks.maxAdsPerSearch);
  let clickedCount = 0;

  for (let i = 0; i < adsToProcess.length; i++) {
    const ad = adsToProcess[i];
    const tituloCorto = ad.title.length > 50 ? ad.title.substring(0, 50) + '...' : ad.title;

    const decision = shouldClickAd(ad);
    
    if (!decision.click) {
      if (decision.reason === 'blacklist') {
        this.log.warn(`${ICONS.skip} ${TEXTS.ads.skippedBlacklist(tituloCorto)}`);
      } else if (decision.reason === 'whitelist') {
        this.log.warn(`${ICONS.skip} ${TEXTS.ads.skippedWhitelist(tituloCorto)}`);
      }
      continue;
    }

    // ✅ Usar índice + título para identificación única
    const adKey = `ad_${i}`;
    const currentClicks = clickCountThisSearch.get(adKey) || 0;
    
    if (currentClicks >= CONFIG.clicks.maxPerAd) {
      this.log.info(`${ICONS.skip} Anuncio ya procesado en esta busqueda`);
      continue;
    }

    this.log.info(`${ICONS.click} ${TEXTS.ads.visiting(i + 1, adsToProcess.length, tituloCorto)}`);

    // ✅ Seleccionar anuncio por índice directo
    const linkHandle = await page.evaluateHandle((adIndex) => {
      const selectors = [
        '#tads a[href*="/aclk?"]',
        '[data-text-ad="1"] a[href*="/aclk?"]',
        '[data-ae="1"] a[href*="/aclk?"]',
        '.uEierd a[href*="/aclk?"]'
      ];
      
      for (const selector of selectors) {
        const links = Array.from(document.querySelectorAll(selector));
        if (links[adIndex]) return links[adIndex];
      }
      
      return null;
    }, i);

    const element = linkHandle.asElement();
    if (!element) {
      this.log.warn(TEXTS.ads.notFound(tituloCorto));
      continue;
    }

    try {
      // Scroll y click
      await element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await smartWait(page, 500, 1000);
      await element.click({ delay: Math.floor(Math.random() * 100) + 100 });
      
      clickCountThisSearch.set(adKey, currentClicks + 1);
      clickedCount++;

      // Esperar navegación con timeout más largo
      await page.waitForNavigation({ 
        waitUntil: 'domcontentloaded', 
        timeout: 20000 
      }).catch(() => {});

      // Esperar estabilización de la página
      await smartWait(page, 2000, 3000);

      const currentUrl = page.url();
      this.log.info(`${ICONS.page} ${TEXTS.ads.pageLoaded(currentUrl.substring(0, 60))}...`);
      
      // ✅ Análisis robusto con try-catch interno
      const analysis = await page.evaluate((keywords) => {
        try {
          const bodyText = document.body?.innerText || document.documentElement?.innerText || '';
          const title = document.title || 'Sin titulo';
          
          return {
            title: title,
            url: window.location.href,
            hasForm: !!document.querySelector('form'),
            detectedKeywords: keywords.filter(kw => 
              bodyText.toLowerCase().includes(kw.toLowerCase())
            )
          };
        } catch (err) {
          return {
            title: document.title || 'Error al analizar',
            url: window.location.href,
            hasForm: false,
            detectedKeywords: [],
            error: err.message
          };
        }
      }, CONFIG.target.detectKeywords);

      // Mostrar resultados
      if (analysis.detectedKeywords && analysis.detectedKeywords.length > 0) {
        for (const kw of analysis.detectedKeywords) {
          this.log.success(`${ICONS.target} ${TEXTS.detection.found(kw, analysis.title)}`);
        }
      } else if (analysis.error) {
        this.log.warn(`Advertencia al analizar: ${analysis.error}`);
      } else {
        this.log.info(TEXTS.detection.title(analysis.title));
      }

      // Esperar antes de volver
      await smartWait(page, CONFIG.clicks.waitAfterClick.min, CONFIG.clicks.waitAfterClick.max);

      // Volver atrás
      try {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
        await smartWait(page, CONFIG.clicks.waitBetweenAds.min, CONFIG.clicks.waitBetweenAds.max);
        await page.waitForSelector('#search, #rso', { 
          visible: true, 
          timeout: CONFIG.navigation.selectorTimeout 
        });
      } catch (backError) {
        this.log.warn(`No se pudo volver a resultados: ${backError.message}`);
        break; // Salir del loop si no puede volver
      }

    } catch (clickError) {
      this.log.error(`Error procesando anuncio: ${clickError.message}`);
      
      // Intentar recuperación
      try {
        const pages = await this.browser.pages();
        if (pages.length > 1) {
          await page.close();
          page = pages[pages.length - 2];
        } else {
          await page.goBack({ timeout: 10000 }).catch(() => {});
        }
      } catch {}
      
      continue;
    }
  }

  this.log.success(`Clicks realizados: ${clickedCount}/${adsToProcess.length}`);
}
}

async function launchBrowser(opts, logger) {
  const sessionId = Math.random().toString(36).substr(2, 8);
  const userDataDir = path.join(tempProfilesDir, `profile_${Date.now()}_${sessionId}`);

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-notifications',
    '--no-first-run',
    '--disable-default-apps',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-plugins',
    '--disable-translate',
    '--disable-web-security',
    '--disable-component-update',
    '--disable-client-side-phishing-detection',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    `--lang=${opts.lang || 'es-AR'}`
  ];

  if (opts.proxy?.server) {
    const proxyUrl = new URL(opts.proxy.server);
    const protocol = proxyUrl.protocol.startsWith('socks') ? 'socks5' : 'http';
    args.push(`--proxy-server=${protocol}://${proxyUrl.host}`);
  }

  if (opts.headless) args.push('--headless=new');

  const browser = await puppeteer.launch({
    headless: !!opts.headless,
    args,
    userDataDir,
    defaultViewport: null,
    ignoreHTTPSErrors: true,
  });

  if (opts.proxy?.username) {
    const password = opts.proxy.password.replace(/_session-\w+/g, `_session-${sessionId}`);
    browser.on('targetcreated', async target => {
      const page = await target.page();
      if (page) {
        try {
          await page.authenticate({ username: opts.proxy.username, password });
        } catch (e) {
          logger.error(TEXTS.errors.proxyAuth);
        }
      }
    });
    logger.info(TEXTS.proxy.configured);
  }

  return browser;
}

async function worker(id, args) {
  const logger = setupLogger();
  logger.info(TEXTS.worker.starting(id));

  const geo = await loadCountryGeo(args.country);
  logger.info(TEXTS.worker.countryLoaded(geo.name, geo.regions?.length || 0));

  const proxy = parseProxy(args.proxy);
  let browser;

  try {
    browser = await launchBrowser({
      headless: args.headless,
      proxy,
      country: args.country,
      lang: args.lang || geo.defaultLang || 'es-AR'
    }, logger);

    const controller = new SearchController(browser, logger, {
      query: args.query,
      keep_open: args.keep_open,
      country: args.country,
      lang: args.lang || geo.defaultLang || 'es-AR',
      mode: args.mode,
      province: args.province,
      geo: geo,
      headless: args.headless,
      coordMode: args.coordMode || 'random'
    });

    await controller.run();
  } catch (e) {
    logger.error(TEXTS.worker.failed(id, e.message));
    console.error(e.stack);
  } finally {
    if (args.headless || !args.keep_open) {
      if (browser) await browser.close().catch(() => {});
    } else {
      console.log(`\n[INFO] ${TEXTS.browser.openForInspection}`);
      console.log(`[INFO] ${TEXTS.browser.closeWhenDone}\n`);
      await new Promise(() => {});
    }
  }
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('query', { alias: 'q', type: 'string', default: 'multipay', describe: 'Termino de busqueda' })
    .option('proxy', { alias: 'p', type: 'string', describe: 'Proxy: usuario:pass@host:puerto' })
    .option('country', { alias: 'c', type: 'string', default: 'AR', describe: 'Codigo de pais' })
    .option('lang', { alias: 'l', type: 'string', describe: 'Idioma (es-AR, en-US)' })
    .option('headless', { type: 'boolean', default: false, describe: 'Ejecutar sin interfaz' })
    .option('keep_open', { type: 'boolean', default: true, describe: 'Mantener navegador abierto' })
    .option('mode', { type: 'string', choices: ['rotating', 'fixed'], default: 'rotating', describe: 'Modo de provincias' })
    .option('province', { type: 'string', default: 'Buenos Aires', describe: 'Provincia si mode=fixed' })
    .option('coordMode', { type: 'string', choices: ['random', 'sequential', 'weighted'], default: 'random', describe: 'Modo de coordenadas' })
    .help()
    .argv;

  await worker(1, argv);
}

main().catch(err => {
  console.error('[ERROR CRITICO]:', err);
  process.exit(1);
});