import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  tmpDir: path.join(process.cwd(), 'tmp_workers'),
  mainFile: 'main.js',
  geoDir: 'geo',
  delayBetweenLaunches: 3000, // ms entre lanzamientos
  colors: {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
  }
};

// Colores para cada worker
const WORKER_COLORS = [
  '\x1b[36m', // Cyan
  '\x1b[33m', // Yellow
  '\x1b[35m', // Magenta
  '\x1b[32m', // Green
  '\x1b[34m', // Blue
  '\x1b[31m', // Red
  '\x1b[37m', // White
  '\x1b[96m', // Light Cyan
  '\x1b[93m', // Light Yellow
  '\x1b[95m', // Light Magenta
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════

function getTimestamp() {
  return new Date().toLocaleTimeString('es-AR', { hour12: false });
}

function log(message, type = 'info') {
  const { colors } = CONFIG;
  const icons = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    worker: '👷',
    rocket: '🚀',
    folder: '📁',
    copy: '📄'
  };
  
  const colorMap = {
    info: colors.cyan,
    success: colors.green,
    error: colors.red,
    warning: colors.yellow
  };
  
  const icon = icons[type] || icons.info;
  const color = colorMap[type] || colors.white;
  
  console.log(`${colors.reset}[${getTimestamp()}] ${icon} ${color}${message}${colors.reset}`);
}

function logWorker(workerId, message, color) {
  const { colors } = CONFIG;
  const prefix = `${color}[Worker ${workerId}]${colors.reset}`;
  console.log(`[${getTimestamp()}] ${prefix} ${message}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE COPIA
// ═══════════════════════════════════════════════════════════════════════════

function copyFileSync(src, dest) {
  fs.copyFileSync(src, dest);
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function cleanTmpDir() {
  if (fs.existsSync(CONFIG.tmpDir)) {
    log(`Limpiando directorio temporal: ${CONFIG.tmpDir}`, 'warning');
    fs.rmSync(CONFIG.tmpDir, { recursive: true, force: true });
  }
}

function setupWorkerDir(workerId) {
  const workerDir = path.join(CONFIG.tmpDir, `worker_${workerId}`);
  
  // Crear directorio del worker
  fs.mkdirSync(workerDir, { recursive: true });
  
  // Copiar main.js
  const mainSrc = path.join(__dirname, CONFIG.mainFile);
  const mainDest = path.join(workerDir, CONFIG.mainFile);
  
  if (fs.existsSync(mainSrc)) {
    copyFileSync(mainSrc, mainDest);
    log(`Worker ${workerId}: Copiado ${CONFIG.mainFile}`, 'copy');
  } else {
    throw new Error(`No se encontró ${CONFIG.mainFile} en ${__dirname}`);
  }
  
  // Copiar carpeta geo
  const geoSrc = path.join(__dirname, CONFIG.geoDir);
  const geoDest = path.join(workerDir, CONFIG.geoDir);
  
  if (fs.existsSync(geoSrc)) {
    copyDirSync(geoSrc, geoDest);
    log(`Worker ${workerId}: Copiada carpeta ${CONFIG.geoDir}`, 'copy');
  } else {
    log(`Advertencia: No se encontró carpeta ${CONFIG.geoDir}`, 'warning');
  }
  
  // Crear carpeta temp_profiles para cada worker
  const profilesDir = path.join(workerDir, 'temp_profiles');
  fs.mkdirSync(profilesDir, { recursive: true });
  
  return workerDir;
}

// ═══════════════════════════════════════════════════════════════════════════
// LANZADOR DE WORKERS
// ═══════════════════════════════════════════════════════════════════════════

function launchWorker(workerId, workerDir, args, color) {
  return new Promise((resolve, reject) => {
    const mainPath = path.join(workerDir, CONFIG.mainFile);
    
    // Construir argumentos para el worker
    const workerArgs = [
      mainPath,
      '-q', args.query,
      '-c', args.country,
      '--mode', args.mode,
      '--coordMode', args.coordMode
    ];
    
    if (args.proxy) {
      workerArgs.push('-p', args.proxy);
    }
    
    if (args.lang) {
      workerArgs.push('-l', args.lang);
    }
    
    if (args.province) {
      workerArgs.push('--province', args.province);
    }
    
    if (args.headless) {
      workerArgs.push('--headless');
    }
    
    if (args.keep_open) {
      workerArgs.push('--keep_open');
    }
    
    logWorker(workerId, `Iniciando proceso...`, color);
    logWorker(workerId, `Directorio: ${workerDir}`, color);
    
    // Spawn del proceso
    const child = spawn('node', workerArgs, {
      cwd: workerDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, WORKER_ID: workerId.toString() }
    });
    
    // Manejar stdout
    child.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          logWorker(workerId, line, color);
        }
      });
    });
    
    // Manejar stderr
    child.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          logWorker(workerId, `${CONFIG.colors.red}${line}${CONFIG.colors.reset}`, color);
        }
      });
    });
    
    // Manejar cierre
    child.on('close', (code) => {
      if (code === 0) {
        logWorker(workerId, `Proceso terminado correctamente`, color);
        resolve({ workerId, code });
      } else {
        logWorker(workerId, `Proceso terminado con código: ${code}`, color);
        resolve({ workerId, code });
      }
    });
    
    // Manejar errores
    child.on('error', (err) => {
      logWorker(workerId, `Error: ${err.message}`, color);
      reject(err);
    });
    
    // Guardar referencia al proceso
    return child;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('copies', { 
      alias: 'n', 
      type: 'number', 
      default: 1, 
      describe: 'Número de copias/workers a ejecutar' 
    })
    .option('query', { 
      alias: 'q', 
      type: 'string', 
      default: 'multipay', 
      describe: 'Término de búsqueda' 
    })
    .option('proxy', { 
      alias: 'p', 
      type: 'string', 
      describe: 'Proxy: usuario:pass@host:puerto' 
    })
    .option('country', { 
      alias: 'c', 
      type: 'string', 
      default: 'AR', 
      describe: 'Código de país' 
    })
    .option('lang', { 
      alias: 'l', 
      type: 'string', 
      describe: 'Idioma (es-AR, en-US)' 
    })
    .option('headless', { 
      type: 'boolean', 
      default: false, 
      describe: 'Ejecutar sin interfaz' 
    })
    .option('keep_open', { 
      type: 'boolean', 
      default: true, 
      describe: 'Mantener navegador abierto' 
    })
    .option('mode', { 
      type: 'string', 
      choices: ['rotating', 'fixed'], 
      default: 'rotating', 
      describe: 'Modo de provincias' 
    })
    .option('province', { 
      type: 'string', 
      default: 'Buenos Aires', 
      describe: 'Provincia si mode=fixed' 
    })
    .option('coordMode', { 
      type: 'string', 
      choices: ['random', 'sequential', 'weighted'], 
      default: 'random', 
      describe: 'Modo de coordenadas' 
    })
    .option('clean', { 
      type: 'boolean', 
      default: true, 
      describe: 'Limpiar directorio temporal antes de iniciar' 
    })
    .option('delay', { 
      alias: 'd', 
      type: 'number', 
      default: 3000, 
      describe: 'Delay (ms) entre lanzamiento de workers' 
    })
    .help()
    .argv;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           🚀 MULTI-WORKER AD CLICKER LAUNCHER 🚀              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Workers: ${String(argv.copies).padEnd(5)} | Query: ${argv.query.substring(0, 25).padEnd(25)}    ║`);
  console.log(`║  País: ${argv.country.padEnd(8)} | Modo: ${argv.mode.padEnd(10)} | Headless: ${argv.headless ? 'Sí' : 'No'}  ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Limpiar directorio temporal si está habilitado
  if (argv.clean) {
    cleanTmpDir();
  }
  
  // Crear directorio base
  fs.mkdirSync(CONFIG.tmpDir, { recursive: true });
  log(`Directorio temporal: ${CONFIG.tmpDir}`, 'folder');
  
  // Configurar y lanzar workers
  const workers = [];
  const processes = [];
  
  for (let i = 1; i <= argv.copies; i++) {
    const color = WORKER_COLORS[(i - 1) % WORKER_COLORS.length];
    
    try {
      // Configurar directorio del worker
      log(`Configurando Worker ${i}...`, 'worker');
      const workerDir = setupWorkerDir(i);
      
      workers.push({ id: i, dir: workerDir, color });
      
    } catch (err) {
      log(`Error configurando Worker ${i}: ${err.message}`, 'error');
    }
  }
  
  log(`${workers.length} workers configurados. Iniciando lanzamiento...`, 'rocket');
  console.log('');
  
  // Lanzar workers con delay entre cada uno
  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    
    if (i > 0) {
      log(`Esperando ${argv.delay}ms antes de lanzar Worker ${worker.id}...`, 'info');
      await new Promise(r => setTimeout(r, argv.delay));
    }
    
    // Lanzar worker (no esperamos que termine, se ejecuta en paralelo)
    const workerPromise = launchWorker(worker.id, worker.dir, argv, worker.color);
    processes.push(workerPromise);
  }
  
  log(`Todos los workers lanzados. Monitoreando...`, 'success');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Presiona Ctrl+C para detener todos los workers');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  
  // Manejar señal de terminación
  process.on('SIGINT', () => {
    console.log('');
    log('Señal de interrupción recibida. Cerrando workers...', 'warning');
    process.exit(0);
  });
  
  // Esperar a que todos los procesos terminen
  try {
    const results = await Promise.all(processes);
    
    console.log('');
    log('═══════════════════════════════════════════════════════════════', 'info');
    log('                    RESUMEN DE EJECUCIÓN                        ', 'info');
    log('═══════════════════════════════════════════════════════════════', 'info');
    
    results.forEach(result => {
      const status = result.code === 0 ? '✅ OK' : `❌ Error (${result.code})`;
      log(`Worker ${result.workerId}: ${status}`, result.code === 0 ? 'success' : 'error');
    });
    
  } catch (err) {
    log(`Error en la ejecución: ${err.message}`, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EJECUTAR
// ═══════════════════════════════════════════════════════════════════════════

main().catch(err => {
  console.error('[ERROR CRÍTICO]:', err);
  process.exit(1);
});