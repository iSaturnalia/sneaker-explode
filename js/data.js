// Каталог моделей, сравнение, размеры, сцены. Цены в рублях.

export const MODELS = {
  aero: {
    name: 'Orbit Aero',
    kind: 'real',
    tagline: 'Беговая, на каждый день',
    price: 14900,
    stats: { weight: 268, stack: 32, cushion: 8, grip: 6 },
    material: { title: 'Вязаный верх', text: 'Сетка из переработанного полиэстера: плотнее на мысе, свободнее у щиколотки. Нога дышит даже в жару.' },
  },
  court: {
    name: 'Orbit Court',
    kind: 'procedural',
    tagline: 'Баскетбольная, высокая',
    price: 13500,
    stats: { weight: 410, stack: 28, cushion: 7, grip: 9 },
    material: { title: 'Кожа и ремешок', text: 'Плотная кожа с подкладкой держит голеностоп, ремешок на липучке фиксирует посадку при прыжках.' },
  },
  skate: {
    name: 'Orbit Skate',
    kind: 'procedural',
    tagline: 'Плоская, для скейта и улицы',
    price: 9900,
    stats: { weight: 360, stack: 18, cushion: 4, grip: 8 },
    material: { title: 'Замша', text: 'Замша на носке выдерживает трение о шкурку, плоская подошва даёт чувствовать доску.' },
  },
  trail: {
    name: 'Orbit Trail',
    kind: 'procedural',
    tagline: 'Массивная, для троп',
    price: 15900,
    stats: { weight: 340, stack: 38, cushion: 9, grip: 10 },
    material: { title: 'Протектор и мыс', text: 'Шипы глубиной 5 мм цепляются за грязь, резиновый мыс защищает пальцы от камней.' },
  },
};

export const MODEL_ORDER = ['aero', 'court', 'skate', 'trail'];

export const STAT_LABELS = {
  weight: { label: 'Вес', unit: 'г', max: 450, lowerIsBetter: true },
  stack: { label: 'Высота подошвы', unit: 'мм', max: 40 },
  cushion: { label: 'Амортизация', unit: '/10', max: 10 },
  grip: { label: 'Сцепление', unit: '/10', max: 10 },
};

// Длина стопы → размеры. Берём первый размер, где стелька длиннее стопы.
export const SIZES = [
  { eu: 36, cm: 22.5, us: 4, uk: 3.5 },
  { eu: 37, cm: 23.5, us: 5, uk: 4 },
  { eu: 38, cm: 24, us: 6, uk: 5 },
  { eu: 39, cm: 25, us: 6.5, uk: 6 },
  { eu: 40, cm: 25.5, us: 7, uk: 6.5 },
  { eu: 41, cm: 26, us: 8, uk: 7 },
  { eu: 42, cm: 26.5, us: 8.5, uk: 8 },
  { eu: 43, cm: 27.5, us: 9.5, uk: 9 },
  { eu: 44, cm: 28, us: 10, uk: 9.5 },
  { eu: 45, cm: 29, us: 11, uk: 10.5 },
  { eu: 46, cm: 30, us: 12, uk: 11 },
];

// Сцены для блока «Где носить».
export const SCENES = {
  city: { name: 'Город ночью', bg: '#0d1020', key: '#9fb7ff', rim: '#ff3ea5', fill: '#3ee0ff', pedestal: '#1a1d2e', fog: 0.0 },
  gym: { name: 'Спортзал', bg: '#2a1c12', key: '#ffd7a8', rim: '#ffb066', fill: '#fff1de', pedestal: '#8a5a34', fog: 0.0 },
  trail: { name: 'Тропа', bg: '#1b2a1f', key: '#fff4d6', rim: '#b7e08a', fill: '#9cc7a4', pedestal: '#3d4a33', fog: 0.0 },
};

export const BASE_BG = '#0f0f11';

// Палитра каждой модели: фон, три пятна света, акцент и цвет текста на акценте.
export const THEMES = {
  aero: { bg: '#071226', glow: ['#1f6fff', '#00c2ff', '#7a5cff'], accent: '#4da3ff', accentInk: '#06101f' },
  court: { bg: '#1a0c06', glow: ['#ff5a1f', '#ffb347', '#ff2d55'], accent: '#ff5a1f', accentInk: '#ffffff' },
  skate: { bg: '#0d0d0d', glow: ['#d4ff3a', '#f4f1ea', '#6b6b6b'], accent: '#d4ff3a', accentInk: '#0d0d0d' },
  trail: { bg: '#08170f', glow: ['#3ddc84', '#c6e36b', '#1f8a70'], accent: '#7ee081', accentInk: '#06140c' },
};
