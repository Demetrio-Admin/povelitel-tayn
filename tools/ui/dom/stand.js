// DOM-стенд окон аккаунта: настоящие PlayerSession и accountUI на фальшивом сервере. Собирается в stand.bundle.js
// (см. tools/ui/dom/dom-test.py) и открывается в Chromium.
import { FakeSupabase } from '../../../tests/helpers/fake-supabase.mjs';
import { GameState } from '../../../src/state/GameState.js';
import { SupabaseApi } from '../../../src/cloud/api.js';
import { PlayerSession } from '../../../src/cloud/PlayerSession.js';
import { installSessionUI } from '../../../src/services.js';
import * as ui from '../../../src/ui/accountUI.js';
import { buildEditorPanel } from '../../../src/ui/editorPanel.js';
import { CLOUD } from '../../../src/config/cloud.config.js';

const srv = new FakeSupabase();
try { localStorage.clear(); } catch (e) { /* ignore */ }
const mk = () => {
  const state = new GameState(null);
  const api = new SupabaseApi({ url: srv.url, anonKey: srv.anonKey, loginDomain: CLOUD.loginDomain, fetchFn: srv.fetch });
  return { state, session: new PlayerSession({ api, state, storage: localStorage, saveDelayMs: 50, minorDelayMs: 200, retryDelaysMs: [60000] }) };
};
const main = mk();
installSessionUI(main.session);
window.t = { srv, ...main, mk, ui, buildEditorPanel, log: [] };
window.standReady = true;
