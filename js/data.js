// Каталог витрины: модели, их «паспорт», авторы 3D-моделей, сцены, палитры.
// Это фанатская витрина, не магазин: цен и заказа нет.

export const MODELS = {
  jordan1: {
    name: 'Air Jordan 1',
    brand: 'Nike',
    year: 1985,
    category: 'Баскетбол',
    tagline: 'Кроссовки, с которых началась культура сникеров',
    file: 'assets/models/jordan1.glb',
    labels: { top: 'Шнурки и язычок', upper: 'Кожаный верх', inner: 'Подкладка', sole: 'Подошва с Air' },
    material: { title: 'Кожа и крылья', text: 'Гладкая кожа, перфорация на носке и логотип с крыльями на воротнике. Силуэт почти не менялся с 1985 года.' },
    credit: { title: 'Nike Air Jordan 1', author: 'DeezVertz (на основе работ makoto и samplemem)', url: 'https://sketchfab.com/3d-models/nike-air-jordan-1-fbe52211197c4b449f29de5aa4eb0611' },
  },
  nb997: {
    name: '997',
    brand: 'New Balance',
    year: 1991,
    category: 'Бег, лайфстайл',
    tagline: 'Беговая классика девяностых, сделанная в США',
    file: 'assets/models/nb997.glb',
    labels: { top: 'Шнуровка', upper: 'Замша и сетка', inner: 'Подкладка', sole: 'Подошва ENCAP' },
    material: { title: 'Замша и сетка', text: 'Замшевые накладки поверх сетки и многослойная подошва с амортизацией в пятке. Серый цвет стал фирменным.' },
    credit: { title: 'New Balance 997', author: 'Isaiah', url: 'https://sketchfab.com/3d-models/new-balance-997-05e79a2dffbc4356bba7e0751fada08f' },
  },
  xultra: {
    name: 'X Ultra 04',
    brand: 'Salomon',
    year: 2021,
    category: 'Хайкинг',
    tagline: 'Горные кроссовки, которые стали носить в городе',
    file: 'assets/models/xultra.glb',
    labels: { top: 'Воротник и шнуровка', upper: 'Верх с каркасом', inner: 'Подкладка', sole: 'Протектор Contagrip' },
    material: { title: 'Каркас и протектор', text: 'Рёбра каркаса держат стопу на неровной тропе, глубокий протектор цепляется за камни и грязь.' },
    credit: { title: 'Salomon X Ultra 04W', author: 'inciprocal', url: 'https://sketchfab.com/3d-models/salomon-x-ultra-04w-2734560ce87a4f93bd64c61329257070' },
  },
  pegasus36: {
    name: 'Air Zoom Pegasus 36',
    brand: 'Nike',
    year: 2019,
    category: 'Бег',
    tagline: 'Рабочая лошадка для ежедневных пробежек',
    file: 'assets/models/pegasus36.glb',
    labels: { top: 'Шнуровка', upper: 'Сетчатый верх', inner: 'Подкладка', sole: 'Подошва с Zoom Air' },
    material: { title: 'Сетка и Zoom Air', text: 'Лёгкая сетка с перфорацией и капсула Zoom Air под передним отделом стопы.' },
    credit: { title: 'Nike Air Zoom Pegasus 36', author: 'quaz30', url: 'https://sketchfab.com/3d-models/nike-air-zoom-pegasus-36-00fd99e778c244c3bd3b65f99dad7cb2' },
  },
  aero: {
    name: 'Sample Runner',
    brand: 'Shopify',
    year: 2021,
    category: 'Учебная модель',
    tagline: 'Эталонная модель кроссовки из набора Khronos',
    file: 'assets/aero.glb',
    labels: { top: 'Шнурки', upper: 'Вязаный верх', inner: 'Подкладка', sole: 'Подошва' },
    material: { title: 'Вязаный верх', text: 'Модель из открытого набора glTF: в одном файле три расцветки — Midnight, Beach и Street.' },
    credit: { title: 'Materials Variants Shoe', author: 'Shopify', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/MaterialsVariantsShoe' },
  },
};

export const MODEL_ORDER = ['jordan1', 'nb997', 'xultra', 'pegasus36', 'aero'];

// Сцены для блока «Где носить».
export const SCENES = {
  city: { name: 'Город ночью', bg: '#0d1020', key: '#9fb7ff', rim: '#ff3ea5', fill: '#3ee0ff', pedestal: '#1a1d2e' },
  gym: { name: 'Спортзал', bg: '#2a1c12', key: '#ffd7a8', rim: '#ffb066', fill: '#fff1de', pedestal: '#8a5a34' },
  trail: { name: 'Тропа', bg: '#1b2a1f', key: '#fff4d6', rim: '#b7e08a', fill: '#9cc7a4', pedestal: '#3d4a33' },
};

// Палитра каждой модели: фон, три пятна света, акцент и цвет текста на акценте.
export const THEMES = {
  jordan1: { bg: '#1a0607', glow: ['#e1262d', '#ff6b4a', '#3a3a3a'], accent: '#ff3b3f', accentInk: '#ffffff' },
  nb997: { bg: '#101216', glow: ['#8a94a6', '#e0533d', '#cfd6e4'], accent: '#e0533d', accentInk: '#ffffff' },
  xultra: { bg: '#071512', glow: ['#22c3a0', '#6fe3c8', '#1d3b5c'], accent: '#3ddbb5', accentInk: '#04130f' },
  pegasus36: { bg: '#0a0f1f', glow: ['#ff5aa8', '#ffd23f', '#3b5bff'], accent: '#ffd23f', accentInk: '#141414' },
  aero: { bg: '#071226', glow: ['#1f6fff', '#00c2ff', '#7a5cff'], accent: '#4da3ff', accentInk: '#06101f' },
};
