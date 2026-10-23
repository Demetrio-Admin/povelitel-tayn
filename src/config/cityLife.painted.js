// ImageGen-painted replacements. Keys and display sizes retain the city animation contract.
const people = ['man_a', 'man_b', 'woman_a', 'woman_b'];
const pets = ['cat_ginger', 'cat_grey', 'cat_tux', 'dog_tan', 'dog_brown'];
const frames = [
  ...people.flatMap(v => Array.from({ length: 5 }, (_, i) => [`${v}_${i}`, `${v}_b_${i}`]).flat()),
  ...pets.flatMap(v => ['walk1', 'walk2', 'run1', 'run2', 'sit'].map(f => `${v}_${f}`)),
  ...[1, 2, 3].map(i => `crow_${i}`),
];
export const CITY_LIFE_PAINTED_FILES = Object.fromEntries(frames.map(f =>
  [`cl_${f}`, `assets/city-life/painted-v1/${f}.webp`]));
