export function abilityButtons(hero, selectedSkill) {
  return hero.skills.map(([icon, name], index) => `
    <button class="ability ${selectedSkill === index ? 'active' : ''}" data-skill="${index}" aria-label="${name}" title="${name}">
      <svg><use href="#i-${icon}"/></svg>
    </button>
  `).join('');
}

export function updatePrimaryButton(button, hero, selectedSkill) {
  const hasSkill = selectedSkill !== null;
  button.disabled = !hasSkill;
  button.querySelector('span').textContent = hasSkill ? hero.skills[selectedSkill][1] : 'Выберите способность';
}
