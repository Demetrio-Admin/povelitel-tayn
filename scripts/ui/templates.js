export function heroCard(hero, state, combat = false) {
  const statuses = (state.heroStatuses[hero.id] || []).slice(0, 2).map(() => '<i></i>').join('');
  return `
    <button class="hero ${state.selected === hero.id ? 'selected' : ''}" data-hero="${hero.id}" aria-label="${hero.name}, ${hero.role}">
      <span class="portrait"></span>
      <span class="hero-rune">${hero.rune}</span>
      <span class="hero-name">${hero.name}</span>
      <span class="hp" style="--hp:${hero.hp}%"><i></i></span>
      ${combat ? `<span class="status-strip">${statuses}</span>` : ''}
    </button>
  `;
}

export function mapModal(step) {
  return `<h2 id="modalTitle">Карта пути</h2><p>Шепчущий лес · этап ${step} из 5</p><div class="map-path"><i></i><i></i><i></i><i></i></div><div class="modal-list"><div class="modal-row"><span class="icon">✦</span><span><b>Текущая цель</b><small>Найти источник шёпота</small></span><em>${step}/5</em></div><div class="modal-row"><span class="icon">⌁</span><span><b>Впереди</b><small>Каменные стражи и след разлома</small></span><em>риск</em></div></div>`;
}

export function bagModal() {
  return '<h2 id="modalTitle">Сумка</h2><p>Только предметы, полезные в текущем походе.</p><div class="modal-list"><div class="modal-row"><span class="icon">⚗</span><span><b>Лечебное зелье</b><small>Восстанавливает здоровье героя</small></span><em>2</em></div><div class="modal-row"><span class="icon">◇</span><span><b>Пыль Истока</b><small>Стабилизирует магическую печать</small></span><em>1</em></div><div class="modal-row"><span class="icon">⌁</span><span><b>Осколок руны</b><small>Ключевой предмет задания</small></span><em>1</em></div></div>';
}

export function heroModal(hero) {
  const skills = hero.skills.map(([icon, name]) => `<div class="modal-row"><span class="icon"><svg width="20" height="20"><use href="#i-${icon}"/></svg></span><span><b>${name}</b><small>Готово к применению</small></span><em>1 ход</em></div>`).join('');
  return `<h2 id="modalTitle">${hero.name}</h2><p>${hero.role}. Здоровье ${hero.hp}%. Нажатие в бою раскрывает до трёх доступных способностей над портретом.</p><div class="modal-list">${skills}</div>`;
}

export function victoryModal() {
  return '<div class="victory-mark" aria-hidden="true"><i></i></div><span class="victory-kicker">Испытание завершено</span><h2 id="modalTitle">Ритуал остановлен</h2><p class="victory-copy">Последняя печать разрушена. Хранитель разлома потерял опору, и тропа в глубину леса снова открыта.</p><div class="modal-list victory-rewards"><div class="modal-row"><span class="icon">◇</span><span><b>Пыль Истока</b><small>Награда за разрушенные печати</small></span><em>+2</em></div><div class="modal-row"><span class="icon">✦</span><span><b>Путь продолжен</b><small>Открыт этап 4 из 5</small></span><em>4/5</em></div></div><button class="victory-return" type="button" data-victory-return><span>Вернуться в Шепчущий лес</span><small>Продолжить путь · этап 4 из 5</small></button>';
}
