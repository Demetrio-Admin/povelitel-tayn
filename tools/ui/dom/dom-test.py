# Проверка окон аккаунта в настоящем браузере (headless Chromium, экран телефона 390×844).
#   python3 tools/ui/dom/dom-test.py [папка для снимков]
# Нужны: playwright для Python и esbuild (node_modules/.bin/esbuild или переменная ESBUILD).
import os, sys, subprocess, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', 'ui', 'shots')
os.makedirs(OUT, exist_ok=True)
ESBUILD = os.environ.get('ESBUILD') or os.path.join(ROOT, 'node_modules', '.bin', 'esbuild')
subprocess.run([ESBUILD, 'tools/ui/dom/stand.js', '--bundle', '--format=esm', '--platform=browser',
                '--outfile=tools/ui/dom/stand.bundle.js', '--external:child_process', '--log-level=warning'], cwd=ROOT, check=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
Handler = functools.partial(Quiet, directory=ROOT)
httpd = socketserver.TCPServer(('127.0.0.1', 0), Handler)
PORT = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

FORBIDDEN = ['Какое сохранение оставить', 'В облаке', 'На этом устройстве', 'Взять из облака', 'Оставить с устройства',
             'Отправить в облако', 'Облако', 'Есть изменения, скоро отправим', 'Supabase', 'e-mail', 'Почта', 'почту для входа']
res = []
def check(cond, msg):
    res.append((bool(cond), msg)); print(('  ✓ ' if cond else '  ✗ ') + msg)

def no_forbidden(pg, where):
    text = pg.locator('body').inner_text()
    bad = [w for w in FORBIDDEN if w in text]
    check(not bad, f'{where}: нет слов облачного сейва и техники сервера' + (f' — {bad}' if bad else ''))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='ru-RU')
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(f'http://127.0.0.1:{PORT}/tools/ui/dom/index.html', wait_until='domcontentloaded')
    pg.wait_for_function('window.standReady')

    print('\nСоздание аккаунта при начале игры')
    pg.evaluate("void t.ui.showRegister(t.session, { mode: 'new', hero: 'witch', onDone: () => { window.done = 1; } })")
    pg.wait_for_selector('.acc-card')
    labels = pg.locator('.acc-field > span').all_inner_texts()
    check(labels == ['Никнейм', 'Пароль', 'Повторите пароль'], 'поля: Никнейм, Пароль, Повторите пароль — почты нет (' + ', '.join(labels) + ')')
    check('восстановить доступ' in pg.locator('.acc-note').text_content(), 'предупреждение о забытом пароле')
    no_forbidden(pg, 'форма регистрации')
    pg.screenshot(path=os.path.join(OUT, 'dom_register.png'))
    def submit_with(nick, pw, pw2):
        pg.fill('input[autocomplete=username]', nick)
        f = pg.locator('input[type=password]')
        f.nth(0).fill(pw); f.nth(1).fill(pw2)
        pg.click('button[type=submit]')
        pg.wait_for_function("document.querySelector('.acc-err').textContent.length > 0 || window.done")
        return pg.locator('.acc-err').inner_text()
    check(submit_with('Дм', 'password-1', 'password-1') == 'Никнейм должен содержать минимум 3 символа.', 'короткий ник — понятная ошибка')
    check(submit_with('Дмитрий', 'password-1', 'password-2') == 'Пароли не совпадают.', '«Пароли не совпадают.»')
    check(submit_with('Дмитрий', 'short', 'short') == 'Пароль должен содержать минимум 8 символов.', 'короткий пароль — понятная ошибка')
    pg.screenshot(path=os.path.join(OUT, 'dom_register_error.png'))
    pg.evaluate('t.srv.delayMs = 400')
    pg.fill('input[autocomplete=username]', 'Дмитрий')
    f = pg.locator('input[type=password]'); f.nth(0).fill('password-1'); f.nth(1).fill('password-1')
    pg.click('button[type=submit]')
    btn = pg.locator('button[type=submit]')
    check(btn.is_disabled() and 'Создаём' in btn.inner_text(), 'во время запроса кнопка занята — дважды не нажать')
    pg.wait_for_function('window.done')
    pg.evaluate('t.srv.delayMs = 0')
    check(pg.evaluate('t.session.registered && t.session.nickname') == 'Дмитрий' and pg.locator('.acc-ov').count() == 0, 'аккаунт «Дмитрий» создан, окно закрылось')

    print('\nПрофиль игрока')
    pg.evaluate("t.state.addItem('coins', 5); t.state.save()")
    pg.wait_for_function("t.session.saving === 'saved' && !t.session.dirty")
    pg.evaluate("void t.ui.showProfile(t.session, { onLogout: () => { window.out = 1; } })")
    pg.wait_for_selector('.acc-big')
    card = pg.locator('.acc-card').inner_text()
    check('Дмитрий' in card and 'Уровень 1' in card and '✓ Прогресс сохранён' in card, 'ник, уровень и «✓ Прогресс сохранён»')
    buttons = pg.locator('.acc-card .acc-row button').all_inner_texts()
    check(buttons == ['Сменить пароль', 'Выйти', 'Закрыть'], 'кнопки: Сменить пароль, Выйти, Закрыть (' + ', '.join(buttons) + ')')
    no_forbidden(pg, 'профиль игрока')
    pg.screenshot(path=os.path.join(OUT, 'dom_profile.png'))
    pg.evaluate("t.state.addItem('coins', 1); t.state.save()")
    pg.wait_for_function("document.querySelector('.acc-status').textContent === 'Сохранение…' || t.session.saving === 'saved'")
    pg.wait_for_function("document.querySelector('.acc-status').textContent === '✓ Прогресс сохранён'")
    check(True, 'статус сохранения обновляется сам (Сохранение… → ✓ Прогресс сохранён)')
    pg.get_by_role('button', name='Выйти').click()
    check('Точно выйти' in pg.locator('.acc-card').inner_text(), 'выход — со вторым нажатием')
    pg.get_by_role('button', name='Точно выйти? Нажмите ещё раз').click()
    pg.wait_for_function('window.out')
    check(pg.evaluate("t.session.status") == 'signed_out' and pg.locator('.acc-ov').count() == 0, 'выход выполнен')

    print('\nВход')
    pg.evaluate("void t.ui.showLogin(t.session, { onDone: () => { window.inside = 1; } })")
    pg.wait_for_selector('.acc-card h2')
    check(pg.locator('.acc-field > span').all_inner_texts() == ['Никнейм', 'Пароль'], 'вход: только Никнейм и Пароль')
    pg.fill('input[autocomplete=username]', 'дмитрий'); pg.fill('input[type=password]', 'wrong-password')
    pg.click('button[type=submit]')
    pg.wait_for_function("document.querySelector('.acc-err').textContent.length > 0")
    check(pg.locator('.acc-err').inner_text() == 'Неверный никнейм или пароль.', '«Неверный никнейм или пароль.»')
    pg.screenshot(path=os.path.join(OUT, 'dom_login_error.png'))
    pg.fill('input[type=password]', 'password-1'); pg.click('button[type=submit]')
    try:
        pg.wait_for_function('window.inside', timeout=8000)
    except Exception:
        print('    отладка:', pg.locator('.acc-err').inner_text(), pg.evaluate('JSON.stringify(t.srv.calls.slice(-4))'))
        raise
    check(pg.evaluate('t.session.nickname') == 'Дмитрий' and pg.evaluate("t.state.item('coins')") == 6, 'вход по нику в другом регистре: прогресс на месте')

    print('\nГость → аккаунт')
    pg.evaluate("window.g = t.mk(); g.session.playAsGuest('witch').then(() => { g.state.addItem('coins', 12); g.state.markEvent('combat_intro_01'); g.state.save(); return g.session.flush(); }).then(() => { window.guestReady = g.session.userId; })")
    pg.wait_for_function('window.guestReady')
    pg.evaluate("void t.ui.showProfile(g.session, {})")
    pg.wait_for_selector('.acc-card h2')
    card = pg.locator('.acc-card').inner_text()
    check('Гостевой профиль' in card and 'Создайте аккаунт' in card and 'автоматически' in card, 'гостевой профиль: пояснение и «Создать аккаунт»')
    no_forbidden(pg, 'профиль гостя')
    pg.screenshot(path=os.path.join(OUT, 'dom_profile_guest.png'))
    pg.get_by_role('button', name='Создать аккаунт').click()
    pg.wait_for_function("document.querySelectorAll('.acc-card').length === 2")
    top = pg.locator('.acc-ov').last
    top.locator('input[autocomplete=username]').fill('Witch_Lady')
    pw = top.locator('input[type=password]'); pw.nth(0).fill('password-9'); pw.nth(1).fill('password-9')
    top.locator('button[type=submit]').click()
    pg.wait_for_function("document.querySelectorAll('.acc-card').length === 1 && document.querySelector('.acc-big')")
    same = pg.evaluate("g.session.userId === window.guestReady && g.session.nickname === 'Witch_Lady' && g.state.item('coins') === 12 && g.state.hasEvent('combat_intro_01')")
    check(same, 'гость стал «Witch_Lady»: тот же user_id, монеты и события на месте; профиль сразу показывает ник')
    pg.screenshot(path=os.path.join(OUT, 'dom_profile_after_register.png'))
    pg.keyboard.press('Escape')

    print('\nНет соединения')
    pg.evaluate("t.srv.offline = true; t.state.addItem('coins', 1); t.state.save()")
    pg.wait_for_function("[...document.querySelectorAll('.acc-card h2')].some(h => h.textContent === 'Нет соединения')")
    check('Пытаемся восстановить соединение' in pg.locator('.acc-ov').last.inner_text(), 'окно «Нет соединения» с пояснением и «Повторить»')
    pg.keyboard.press('Escape')
    check(pg.locator('.acc-ov').count() == 1, 'его нельзя закрыть, пока нет связи')
    pg.screenshot(path=os.path.join(OUT, 'dom_offline.png'))
    pg.evaluate('t.srv.offline = false')
    pg.get_by_role('button', name='Повторить').click()
    pg.wait_for_function("document.querySelectorAll('.acc-ov').length === 0")
    check(pg.evaluate("t.session.status") == 'ready', '«Повторить»: связь есть — окно закрылось, игра продолжается')

    print('\nПанель редактора карты (телефон)')
    ctx3 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2); pg3 = ctx3.new_page()
    pg3.goto(f'http://127.0.0.1:{PORT}/tools/ui/dom/index.html'); pg3.wait_for_function('window.standReady')
    pg3.evaluate("window.log = []; window.panel = t.buildEditorPanel(new Proxy({}, { get: (o, k) => (...a) => { window.log.push(String(k)); if (String(k).startsWith('mode_')) window.panel.setMode(String(k).slice(5)); } })); panel.setMode('props')")
    vis = lambda names: [n for n in names if pg3.locator(f'[data-a={n}]').is_visible()]
    check(vis(['dup', 'flip', 'delete']) == ['dup', 'flip', 'delete'] and not vis(['pt_add', 'wall_add']), 'вкладка «Объекты»: кнопки объектов, без кнопок дорог и стен')
    pg3.screenshot(path=os.path.join(OUT, 'dom_editor_props.png'))
    pg3.click('[data-a=mode_terrain]')
    check(vis(['pt_add', 'pt_del', 'wider', 'smooth', 'join', 'magnet', 'road_new', 'pond_new', 'shape_del']) == ['pt_add', 'pt_del', 'wider', 'smooth', 'join', 'magnet', 'road_new', 'pond_new', 'shape_del'] and not vis(['dup', 'wall_add']), 'вкладка «Дороги и река»: точки, ширина, примыкание, магнит, новые линии')
    pg3.screenshot(path=os.path.join(OUT, 'dom_editor_terrain.png'))
    pg3.click('[data-a=mode_walls]')
    check(vis(['wall_add', 'wall_dup', 'wall_del', 'w_plus', 'h_minus']) == ['wall_add', 'wall_dup', 'wall_del', 'w_plus', 'h_minus'] and not vis(['pt_add', 'dup']), 'вкладка «Стены»: добавить, копия, удалить, размер')
    pg3.select_option('[data-r=wallkind]', 'ruin'); pg3.click('[data-a=wall_add]')
    check(pg3.evaluate('window.log.includes("wall_add")'), '«＋ Добавить» передаёт тип стены редактору')
    pg3.screenshot(path=os.path.join(OUT, 'dom_editor_walls.png'))
    fits = pg3.evaluate("(() => { const r = document.getElementById('me-panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()")
    check(fits, 'панель целиком помещается в экран телефона')
    pg3.click('[data-a=mode_props]')
    check(pg3.locator('[data-a=mode_props]').evaluate("e => e.classList.contains('me-on')"), 'активная вкладка подсвечена')

    print('\nПрочее')
    check(not pg.evaluate("Object.keys(localStorage).filter(k => !k.startsWith('witch_rpg_auth')).length"), 'в localStorage только токен входа')
    check(not errs, 'ошибок в консоли нет' + (': ' + '; '.join(errs[:3]) if errs else ''))
    ctx2 = b.new_context(viewport={'width': 1280, 'height': 800}); pg2 = ctx2.new_page()
    pg2.goto(f'http://127.0.0.1:{PORT}/tools/ui/dom/index.html'); pg2.wait_for_function('window.standReady')
    pg2.evaluate("void t.ui.showRegister(t.session, { mode: 'new', hero: 'witch' })")
    pg2.screenshot(path=os.path.join(OUT, 'dom_register_desktop.png'))
    b.close()

httpd.shutdown()
bad = [m for ok, m in res if not ok]
print('\n✗ ПРОВАЛЕНО: ' + str(len(bad)) if bad else '\n✓ Окна аккаунта в браузере проверены')
sys.exit(1 if bad else 0)
