#!/usr/bin/env python3
"""Проверка загрузки графики по локациям в настоящем браузере (headless Chromium).

  python3 tools/ui/packs-test.py [--no-build]

Собирает игру (vite build), открывает её и проверяет:
  1. на старте в лесу не качаются пакеты города и глав 2–3;
  2. при переходе в КАЖДУЮ локацию и комнату все запрошенные сценой текстуры существуют
     и не являются серыми заглушками «файл не загрузился»;
  3. после обхода всего мира нет ошибок страницы и битых запросов к assets/.
Нужны playwright для Python и node_modules (vite).
"""
import functools, http.server, json, os, socketserver, subprocess, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if '--no-build' not in sys.argv:
    subprocess.run(['npx', 'vite', 'build', '--logLevel', 'warn'], cwd=ROOT, check=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=os.path.join(ROOT, 'dist')))
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

# пути файлов не-core пакетов — их на старте в лесу быть не должно
LAZY_PATHS = json.loads(subprocess.run(
    ['node', '--input-type=module', '-e',
     "import {PACK_IMAGES} from './src/config/assets.packs.js';"
     "const u=m=>Object.values(m).map(p=>'/'+p.split('?')[0]);const core=new Set(u(PACK_IMAGES.core));"
     "console.log(JSON.stringify(Object.entries(PACK_IMAGES).filter(([id])=>id!=='core').flatMap(([,m])=>u(m)).filter(p=>!core.has(p))))"],
    cwd=ROOT, capture_output=True, text=True, check=True).stdout)

LOCS = json.loads(subprocess.run(
    ['node', '--input-type=module', '-e',
     "import {LOCATIONS} from './src/config/locations.js';"
     "console.log(JSON.stringify(LOCATIONS.map(l=>({id:l.id,requires:l.requires||null}))))"],
    cwd=ROOT, capture_output=True, text=True, check=True).stdout)

fails = []
def check(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond: fails.append(msg)

HOOK = """() => { const t = window.__game.textures; window.__seen = new Set();
  for (const f of ['getFrame', 'get']) { const o = t[f].bind(t); t[f] = (k, ...a) => { if (typeof k === 'string') window.__seen.add(k); return o(k, ...a); }; } }"""
# terrain_* — чанки земли, создаются на лету; city_witch_* — атласы города, режутся на кадры и удаляются
BAD = """() => { const t = window.__game.textures, sc = window.__game.scene.getScene('ExplorationScene'), s = new Set(window.__seen);
  for (const o of sc.children.list) { const k = o.texture && o.texture.key; if (k && k !== '__DEFAULT' && k !== '__MISSING') s.add(k); }
  const out = [];
  for (const k of s) { if (k.startsWith('__') || k.startsWith('terrain_') || k === 'city_witch_north' || k === 'city_witch_south') continue; if (!t.exists(k)) out.push(k + ' (нет текстуры)'); else if (t.get(k).customData && t.get(k).customData.placeholder) out.push(k + ' (заглушка)'); }
  return out; }"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
    errors, reqs, bad = [], [], []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('response', lambda r: (reqs.append(r.url), bad.append(r.url) if '/assets/' in r.url and r.status >= 400 else None))
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?skipmenu&reset&hero=witch&notrack', wait_until='domcontentloaded')
    pg.wait_for_function("window.__game && window.__game.scene.isActive('ExplorationScene')", timeout=120000)
    time.sleep(6)   # дольше фоновой подкачки (4 с): в новой игре открыт только лес
    lazy = [u for u in reqs if any(path in u for path in LAZY_PATHS)]
    check(not lazy, f'старт в лесу не качает пакеты других локаций (лишних файлов: {len(lazy)}, например {[u.split("/assets/")[-1] for u in lazy[:3]]})')
    n_boot = sum(1 for u in reqs if '/assets/' in u)
    print(f'     запросов к assets/ на старте: {n_boot}')

    pg.evaluate(HOOK)
    ids = [l['id'] for l in LOCS]
    # открыть все локации, чтобы переходы не упирались в «пока закрыто»
    pg.evaluate("(evs) => { const st = window.__witch.state; for (const k of evs) st.markEvent(k); }",
                sorted({l['requires'] for l in LOCS if l['requires']} | {'chapter_2_complete', 'ch2_start', 'ch3_leaf_read'}))
    for lid in ids:
        pg.evaluate("() => window.__seen.clear()")
        pg.evaluate("(id) => window.__game.scene.getScene('ExplorationScene').travelToLocation(id)", lid)
        try:
            pg.wait_for_function("""(id) => { const sc = window.__game.scene.getScene('ExplorationScene');
              return sc && sc.sys.isActive() && sc.loc && sc.loc.id === id && !sc.inTransition && sc.children.list.length > 20; }""",
                                 arg=lid, timeout=60000)
        except Exception:
            check(False, f'{lid}: переход не завершился'); continue
        time.sleep(2.5)
        missing = pg.evaluate(BAD)
        check(not missing, f'{lid}: все текстуры на месте' + (f' — {missing[:6]}' if missing else ''))

    check(not bad, f'нет битых запросов к assets/ ({bad[:3]})')
    check(not errors, f'нет ошибок страницы ({errors[:2]})')
    total = sum(1 for u in reqs if '/assets/' in u)
    print(f'     всего запросов к assets/ после обхода мира: {total}')
    b.close()

print('\nOK' if not fails else f'\nПровалено: {len(fails)}')
sys.exit(1 if fails else 0)
