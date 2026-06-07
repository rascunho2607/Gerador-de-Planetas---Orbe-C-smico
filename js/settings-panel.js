const STORAGE_KEY = 'orbeCosmico.graphicsSettings.v1';

const DEFAULT_SETTINGS = {
    graphicsPreset: 'medium',
    internalResolution: 1,
    pixelRatioMode: 'auto',
    antialiasEnabled: true,
    targetFps: 'unlimited',
    autoPerformanceOptimization: false,

    cinematicLightingEnabled: true,
    cinematicLightingPreset: 'medium',
    cinematicExposure: 1.08,
    cinematicContrast: 1.1,
    cinematicIntensity: 1,
    lightIntensity: 1.45,
    ambientIntensity: 0.24,
    cinematicBloom: true,
    cinematicBloomStrength: 0.42,
    cinematicAtmosphereFresnel: true,
    cinematicFakeReflections: true,
    cinematicShadowQuality: 'off',
    cinematicAmbientOcclusion: false,

    lifeEnabled: false,
    dinoAnimationEnabled: true,
    dinoPseudo3dEnabled: true,
    dinoBillboardFollow: 0.7,
    dinoMaxSideAngle: 65,
    dinoDistanceCulling: true,
    dinoRenderDistance: 55,
    dinoAnimateDistance: 35,
    dinoCount: 24,
    dinoMaxActive: 80,
    dinoSpriteQuality: 'medium',
    dinoDebugVisible: false,

    explorationEnabled: true,
    explorationMouseSensitivity: 1,
    explorationWalkSpeed: 1,
    explorationRunSpeed: 1,
    explorationDinoSpeed: 1,
    explorationJumpStrength: 1,
    explorationHeadBobEnabled: true,
    explorationHeadBobIntensity: 1,
    explorationCameraDistance: 'medium',

    vegetationEnabled: true,
    vegetationDensity: 'medium',
    vegetationRenderDistance: 48,
    vegetationQuality: 'medium',
    vegetationVarietyLevel: 'medium',
    vegetationBiomeVariety: 1,
    vegetationForestIntensity: 1,
    vegetationScenicEnabled: true,
    vegetationScenicIntensity: 0.75,
    vegetationGrowthEnabled: true,
    vegetationRegrowthEnabled: true,
    vegetationGrowthSpeed: 1,
    vegetationWindEnabled: true,
    vegetationWindIntensity: 0.35,
    vegetationAlienEnabled: true,
    vegetationLowPlantsEnabled: true,
    vegetationDeadEnabled: true,
    vegetationFungiCrystalsEnabled: true,
    vegetationDebugBiomes: false,
    vegetationDebugClusters: false,
    vegetationRegenerateToken: 0,

    cosmicCometsEnabled: true,
    cosmicCometCount: 3,
    cosmicCometTailQuality: 'medium',
    cosmicCometTailIntensity: 1.25,
    particleDensity: 'medium',
    particleMultiplier: 1,
    cosmicNebulasEnabled: true,
    nebulaIntensity: 0.55,
    cosmicBlackHolesEnabled: true,
    blackHoleLensQuality: 'medium',
    cosmicLensDistortionEnabled: true,
    cosmicStationsEnabled: true,
    cosmicStationCount: 2,
    cosmicPlanetsEnabled: true,
    cosmicPlanetCount: 4,
    asteroidCount: 0,

    fluidEffectsEnabled: true,
    fluidQuality: 'medium',
    fluidNebulasEnabled: true,
    fluidPlasmaEnabled: true,
    fluidExplosionsEnabled: true,
    fluidBlackHolesEnabled: true,
    fluidTrailsEnabled: true,
    fluidIntensity: 0.68,
    fluidInternalResolution: 192,
    fluidUpdateRate: 15,
    fluidMaxSimultaneous: 7,

    ringsEnabled: false,
    ringDebrisEnabled: true,
    ringDebrisDensity: 1,
    ringDebrisQuality: 'medium',
    ringAnimationEnabled: true,

    powerSaveMode: false,
    pauseWhenHidden: true,
    chaosQuality: 'medium',
    chaosMaxEffects: 90,
    chaosMaxFragments: 70,
    decorativeRenderDistance: 160,
    distantUpdateReduction: true,
    maxActiveObjects: 220,
    showFps: true,
    showStats: true,
    showFpsCounter: false,
    showFrameTimeLine: false
};

const GRAPHICS_PRESETS = {
    low: {
        graphicsPreset: 'low',
        internalResolution: 0.75,
        pixelRatioMode: '1',
        targetFps: '30',
        cinematicLightingPreset: 'low',
        cinematicBloom: false,
        cinematicShadowQuality: 'off',
        cinematicAmbientOcclusion: false,
        particleMultiplier: 0.55,
        particleDensity: 'low',
        chaosQuality: 'low',
        chaosMaxEffects: 38,
        chaosMaxFragments: 22,
        cosmicCometCount: 1,
        cosmicCometTailQuality: 'low',
        cosmicCometTailIntensity: 0.75,
        fluidQuality: 'low',
        fluidInternalResolution: 128,
        fluidUpdateRate: 10,
        fluidMaxSimultaneous: 4,
        fluidExplosionsEnabled: false,
        fluidTrailsEnabled: false,
        dinoCount: 12,
        dinoMaxActive: 28,
        vegetationDensity: 'low',
        vegetationRenderDistance: 34,
        vegetationQuality: 'low',
        vegetationVarietyLevel: 'low',
        vegetationBiomeVariety: 0.65,
        vegetationForestIntensity: 0.72,
        vegetationScenicEnabled: true,
        vegetationScenicIntensity: 0.45,
        vegetationWindEnabled: false,
        vegetationWindIntensity: 0.12,
        vegetationLowPlantsEnabled: true,
        vegetationDeadEnabled: true,
        vegetationFungiCrystalsEnabled: false,
        cosmicNebulasEnabled: false,
        blackHoleLensQuality: 'low',
        ringDebrisDensity: 0.35
    },
    medium: {
        graphicsPreset: 'medium',
        internalResolution: 1,
        pixelRatioMode: 'auto',
        targetFps: '60',
        cinematicLightingPreset: 'medium',
        cinematicBloom: true,
        cinematicBloomStrength: 0.42,
        cinematicShadowQuality: 'off',
        particleMultiplier: 1,
        particleDensity: 'medium',
        chaosQuality: 'medium',
        chaosMaxEffects: 72,
        chaosMaxFragments: 56,
        cosmicCometCount: 3,
        cosmicCometTailQuality: 'medium',
        cosmicCometTailIntensity: 1.15,
        fluidQuality: 'medium',
        fluidInternalResolution: 192,
        fluidUpdateRate: 15,
        fluidMaxSimultaneous: 7,
        fluidExplosionsEnabled: true,
        fluidTrailsEnabled: true,
        dinoCount: 24,
        dinoMaxActive: 60,
        vegetationDensity: 'medium',
        vegetationRenderDistance: 48,
        vegetationQuality: 'medium',
        vegetationVarietyLevel: 'medium',
        vegetationBiomeVariety: 1,
        vegetationForestIntensity: 1,
        vegetationScenicEnabled: true,
        vegetationScenicIntensity: 0.75,
        vegetationWindEnabled: true,
        vegetationWindIntensity: 0.32,
        vegetationLowPlantsEnabled: true,
        vegetationDeadEnabled: true,
        vegetationFungiCrystalsEnabled: true,
        cosmicNebulasEnabled: true,
        blackHoleLensQuality: 'medium',
        ringDebrisDensity: 0.8
    },
    high: {
        graphicsPreset: 'high',
        internalResolution: 1.25,
        pixelRatioMode: 'auto',
        targetFps: '60',
        cinematicLightingPreset: 'high',
        cinematicBloom: true,
        cinematicBloomStrength: 0.58,
        cinematicShadowQuality: 'medium',
        cinematicAmbientOcclusion: true,
        particleMultiplier: 1.25,
        particleDensity: 'high',
        chaosQuality: 'high',
        chaosMaxEffects: 120,
        chaosMaxFragments: 110,
        cosmicCometCount: 5,
        cosmicCometTailQuality: 'high',
        cosmicCometTailIntensity: 1.45,
        fluidQuality: 'high',
        fluidInternalResolution: 256,
        fluidUpdateRate: 24,
        fluidMaxSimultaneous: 10,
        fluidExplosionsEnabled: true,
        fluidTrailsEnabled: true,
        dinoCount: 36,
        dinoMaxActive: 90,
        vegetationDensity: 'high',
        vegetationRenderDistance: 62,
        vegetationQuality: 'high',
        vegetationVarietyLevel: 'high',
        vegetationBiomeVariety: 1.2,
        vegetationForestIntensity: 1.12,
        vegetationScenicEnabled: true,
        vegetationScenicIntensity: 0.95,
        vegetationWindEnabled: true,
        vegetationWindIntensity: 0.5,
        vegetationLowPlantsEnabled: true,
        vegetationDeadEnabled: true,
        vegetationFungiCrystalsEnabled: true,
        cosmicNebulasEnabled: true,
        blackHoleLensQuality: 'high',
        ringDebrisDensity: 1.15
    },
    cinematic: {
        graphicsPreset: 'cinematic',
        internalResolution: 1.25,
        pixelRatioMode: '2',
        targetFps: 'unlimited',
        cinematicLightingPreset: 'cinematic',
        cinematicBloom: true,
        cinematicBloomStrength: 0.74,
        cinematicShadowQuality: 'high',
        cinematicAmbientOcclusion: true,
        particleMultiplier: 1.45,
        particleDensity: 'cinematic',
        chaosQuality: 'cinematic',
        chaosMaxEffects: 180,
        chaosMaxFragments: 160,
        cosmicCometCount: 6,
        cosmicCometTailQuality: 'high',
        cosmicCometTailIntensity: 1.75,
        fluidQuality: 'cinematic',
        fluidInternalResolution: 384,
        fluidUpdateRate: 30,
        fluidMaxSimultaneous: 14,
        fluidExplosionsEnabled: true,
        fluidTrailsEnabled: true,
        dinoCount: 42,
        dinoMaxActive: 100,
        vegetationDensity: 'cinematic',
        vegetationRenderDistance: 78,
        vegetationQuality: 'cinematic',
        vegetationVarietyLevel: 'cinematic',
        vegetationBiomeVariety: 1.38,
        vegetationForestIntensity: 1.24,
        vegetationScenicEnabled: true,
        vegetationScenicIntensity: 1.18,
        vegetationWindEnabled: true,
        vegetationWindIntensity: 0.72,
        vegetationLowPlantsEnabled: true,
        vegetationDeadEnabled: true,
        vegetationFungiCrystalsEnabled: true,
        cosmicNebulasEnabled: true,
        blackHoleLensQuality: 'high',
        ringDebrisDensity: 1.35
    }
};

const CONTROL_SECTIONS = [
    {
        title: 'Performance Global',
        controls: [
            { key: 'graphicsPreset', label: 'Preset grafico', type: 'select', options: [['low', 'Baixo'], ['medium', 'Medio'], ['high', 'Alto'], ['cinematic', 'Cinematografico']] },
            { key: 'autoPerformanceOptimization', label: 'Otimizacao automatica de desempenho', type: 'checkbox' },
            { key: 'internalResolution', label: 'Resolucao interna', type: 'select', options: [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%']] },
            { key: 'pixelRatioMode', label: 'Pixel ratio', type: 'select', options: [['auto', 'Automatico'], ['1', '1x'], ['1.5', '1.5x'], ['2', '2x']] },
            { key: 'antialiasEnabled', label: 'Antialias no proximo renderer', type: 'checkbox' },
            { key: 'targetFps', label: 'FPS alvo', type: 'select', options: [['30', '30'], ['60', '60'], ['unlimited', 'Ilimitado']] }
        ]
    },
    {
        title: 'Iluminacao cinematografica',
        controls: [
            { key: 'cinematicLightingEnabled', label: 'Ativar iluminacao', type: 'checkbox' },
            { key: 'cinematicLightingPreset', label: 'Preset de luz', type: 'select', options: [['low', 'Baixo'], ['medium', 'Medio'], ['high', 'Alto'], ['cinematic', 'Cinematografico']] },
            { key: 'cinematicExposure', label: 'Exposicao', type: 'range', min: 0.6, max: 1.8, step: 0.01 },
            { key: 'lightIntensity', label: 'Luz solar', type: 'range', min: 0, max: 3, step: 0.05 },
            { key: 'ambientIntensity', label: 'Luz ambiente', type: 'range', min: 0, max: 1.2, step: 0.02 },
            { key: 'cinematicBloom', label: 'Bloom', type: 'checkbox' },
            { key: 'cinematicBloomStrength', label: 'Intensidade bloom', type: 'range', min: 0, max: 1.4, step: 0.01 },
            { key: 'cinematicAtmosphereFresnel', label: 'Atmosfera Fresnel', type: 'checkbox' },
            { key: 'cinematicFakeReflections', label: 'Reflexos fake', type: 'checkbox' },
            { key: 'cinematicShadowQuality', label: 'Sombras', type: 'select', options: [['off', 'Desligadas'], ['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta']] },
            { key: 'cinematicAmbientOcclusion', label: 'Oclusao fake', type: 'checkbox' }
        ]
    },
    {
        title: 'Dinossauros e sprites',
        controls: [
            { key: 'lifeEnabled', label: 'Vida dinossauriana', type: 'checkbox' },
            { key: 'dinoAnimationEnabled', label: 'Animar sprites', type: 'checkbox' },
            { key: 'dinoPseudo3dEnabled', label: 'Rotacao pseudo-3D', type: 'checkbox' },
            { key: 'dinoBillboardFollow', label: 'Acompanhar camera', type: 'range', min: 0, max: 1, step: 0.01, format: 'percent' },
            { key: 'dinoMaxSideAngle', label: 'Angulo lateral maximo', type: 'range', min: 25, max: 85, step: 1 },
            { key: 'dinoDistanceCulling', label: 'Render por distancia', type: 'checkbox' },
            { key: 'dinoRenderDistance', label: 'Distancia render', type: 'range', min: 12, max: 95, step: 1 },
            { key: 'dinoCount', label: 'Maximo de dinos', type: 'range', min: 0, max: 120, step: 1 },
            { key: 'dinoMaxActive', label: 'Dinos ativos', type: 'range', min: 8, max: 120, step: 1 },
            { key: 'dinoSpriteQuality', label: 'Qualidade sprites', type: 'select', options: [['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta']] },
            { key: 'dinoDebugVisible', label: 'Debug dinos', type: 'checkbox' }
        ]
    },
    {
        title: 'Exploracao',
        controls: [
            { key: 'explorationEnabled', label: 'Ativar exploracao', type: 'checkbox' },
            { key: 'explorationMouseSensitivity', label: 'Sensibilidade camera', type: 'range', min: 0.35, max: 2.2, step: 0.05 },
            { key: 'explorationWalkSpeed', label: 'Velocidade caminhada', type: 'range', min: 0.4, max: 2.4, step: 0.05 },
            { key: 'explorationRunSpeed', label: 'Velocidade corrida', type: 'range', min: 0.4, max: 2.6, step: 0.05 },
            { key: 'explorationDinoSpeed', label: 'Velocidade dino', type: 'range', min: 0.4, max: 2.4, step: 0.05 },
            { key: 'explorationJumpStrength', label: 'Forca do pulo', type: 'range', min: 0.4, max: 2.2, step: 0.05 },
            { key: 'explorationHeadBobEnabled', label: 'Head bob', type: 'checkbox' },
            { key: 'explorationHeadBobIntensity', label: 'Intensidade head bob', type: 'range', min: 0, max: 2, step: 0.05 },
            { key: 'explorationCameraDistance', label: 'Camera do dino', type: 'select', options: [['near', 'Perto'], ['medium', 'Media'], ['far', 'Longe']] }
        ]
    },
    {
        title: 'Vegetacao',
        controls: [
            { key: 'vegetationEnabled', label: 'Ativar vegetacao', type: 'checkbox' },
            { key: 'vegetationDensity', label: 'Densidade', type: 'select', options: [['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta'], ['ultra', 'Ultra'], ['cinematic', 'Cinematografica']] },
            { key: 'vegetationRenderDistance', label: 'Distancia render', type: 'range', min: 20, max: 90, step: 1 },
            { key: 'vegetationQuality', label: 'Qualidade', type: 'select', options: [['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta'], ['cinematic', 'Cinematografica']] },
            { key: 'vegetationVarietyLevel', label: 'Variedade de vegetacao', type: 'select', options: [['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta'], ['cinematic', 'Cinematografica']] },
            { key: 'vegetationBiomeVariety', label: 'Variedade por bioma', type: 'range', min: 0.2, max: 1.8, step: 0.02 },
            { key: 'vegetationForestIntensity', label: 'Intensidade florestas', type: 'range', min: 0.2, max: 1.8, step: 0.02 },
            { key: 'vegetationScenicEnabled', label: 'Belas vistas', type: 'checkbox' },
            { key: 'vegetationScenicIntensity', label: 'Composicao visual', type: 'range', min: 0, max: 1.6, step: 0.02 },
            { key: 'vegetationGrowthEnabled', label: 'Crescimento', type: 'checkbox' },
            { key: 'vegetationRegrowthEnabled', label: 'Regeneracao por bioma', type: 'checkbox' },
            { key: 'vegetationGrowthSpeed', label: 'Velocidade crescimento', type: 'range', min: 0.1, max: 60, step: 0.1 },
            { key: 'vegetationWindEnabled', label: 'Vento', type: 'checkbox' },
            { key: 'vegetationWindIntensity', label: 'Intensidade vento', type: 'range', min: 0, max: 1.4, step: 0.02 },
            { key: 'vegetationAlienEnabled', label: 'Vegetacao alienigena', type: 'checkbox' },
            { key: 'vegetationLowPlantsEnabled', label: 'Plantas baixas', type: 'checkbox' },
            { key: 'vegetationDeadEnabled', label: 'Arvores mortas/queimadas', type: 'checkbox' },
            { key: 'vegetationFungiCrystalsEnabled', label: 'Fungos/cristais alienigenas', type: 'checkbox' },
            { key: 'vegetationDebugBiomes', label: 'Debug de biomas', type: 'checkbox' },
            { key: 'vegetationDebugClusters', label: 'Debug de clusters', type: 'checkbox' },
            { key: 'vegetationRegenerateToken', label: 'Regenerar vegetacao', type: 'button' }
        ]
    },
    {
        title: 'Particulas e espaco',
        controls: [
            { key: 'cosmicCometsEnabled', label: 'Cometas animados', type: 'checkbox' },
            { key: 'cosmicCometCount', label: 'Quantidade cometas', type: 'range', min: 0, max: 10, step: 1 },
            { key: 'cosmicCometTailQuality', label: 'Qualidade da cauda', type: 'select', options: [['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta'], ['ultra', 'Ultra'], ['cinematic', 'Cinematografica']] },
            { key: 'particleDensity', label: 'Densidade particulas', type: 'select', options: [['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta'], ['ultra', 'Ultra'], ['cinematic', 'Cinematografica']] },
            { key: 'particleMultiplier', label: 'Multiplicador particulas', type: 'range', min: 0.25, max: 1.75, step: 0.05 },
            { key: 'cosmicNebulasEnabled', label: 'Nebulosas animadas', type: 'checkbox' },
            { key: 'nebulaIntensity', label: 'Intensidade nebulosas', type: 'range', min: 0, max: 1, step: 0.01 },
            { key: 'cosmicBlackHolesEnabled', label: 'Buracos negros', type: 'checkbox' },
            { key: 'blackHoleLensQuality', label: 'Lente gravitacional', type: 'select', options: [['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta'], ['ultra', 'Ultra'], ['cinematic', 'Cinematografica']] },
            { key: 'cosmicStationsEnabled', label: 'Satelites/estacoes', type: 'checkbox' },
            { key: 'cosmicStationCount', label: 'Quantidade satelites', type: 'range', min: 0, max: 8, step: 1 },
            { key: 'cosmicPlanetsEnabled', label: 'Planetas secundarios', type: 'checkbox' },
            { key: 'cosmicPlanetCount', label: 'Quantidade planetas', type: 'range', min: 0, max: 8, step: 1 },
            { key: 'asteroidCount', label: 'Asteroides/detritos', type: 'range', min: 0, max: 80, step: 5 }
        ]
    },
    {
        title: 'Efeitos Cosmicos Fluidos',
        controls: [
            { key: 'fluidEffectsEnabled', label: 'Ativar WebGL Fluid', type: 'checkbox' },
            { key: 'fluidQuality', label: 'Qualidade fluida', type: 'select', options: [['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta'], ['ultra', 'Ultra'], ['cinematic', 'Cinematografica']] },
            { key: 'fluidNebulasEnabled', label: 'Nebulosas fluidas', type: 'checkbox' },
            { key: 'fluidPlasmaEnabled', label: 'Plasma e energia', type: 'checkbox' },
            { key: 'fluidExplosionsEnabled', label: 'Fluido em explosoes', type: 'checkbox' },
            { key: 'fluidBlackHolesEnabled', label: 'Fluido em buracos negros', type: 'checkbox' },
            { key: 'fluidTrailsEnabled', label: 'Rastros energeticos', type: 'checkbox' },
            { key: 'fluidIntensity', label: 'Intensidade fluida', type: 'range', min: 0, max: 1.4, step: 0.02 },
            { key: 'fluidInternalResolution', label: 'Resolucao fluida', type: 'select', options: [[96, '96 px'], [128, '128 px'], [192, '192 px'], [256, '256 px'], [384, '384 px'], [512, '512 px']] },
            { key: 'fluidUpdateRate', label: 'Taxa de atualizacao', type: 'select', options: [[6, '6 FPS'], [10, '10 FPS'], [15, '15 FPS'], [24, '24 FPS'], [30, '30 FPS']] },
            { key: 'fluidMaxSimultaneous', label: 'Limite simultaneo', type: 'range', min: 1, max: 18, step: 1 }
        ]
    },
    {
        title: 'Aneis planetarios',
        controls: [
            { key: 'ringsEnabled', label: 'Aneis', type: 'checkbox' },
            { key: 'ringDebrisEnabled', label: 'Detritos dos aneis', type: 'checkbox' },
            { key: 'ringDebrisDensity', label: 'Densidade detritos', type: 'range', min: 0, max: 6.6, step: 0.05 },
            { key: 'ringDebrisQuality', label: 'Qualidade detritos', type: 'select', options: [['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta'], ['ultra', 'Ultra'], ['cinematic', 'Cinematografica']] },
            { key: 'ringAnimationEnabled', label: 'Animar aneis', type: 'checkbox' }
        ]
    },
    {
        title: 'Performance e otimizacao',
        controls: [
            { key: 'powerSaveMode', label: 'Economia de energia', type: 'checkbox' },
            { key: 'pauseWhenHidden', label: 'Pausar em segundo plano', type: 'checkbox' },
            { key: 'chaosQuality', label: 'Qualidade modo caos', type: 'select', options: [['low', 'Baixa'], ['medium', 'Media'], ['high', 'Alta'], ['ultra', 'Ultra'], ['cinematic', 'Cinematografica']] },
            { key: 'chaosMaxEffects', label: 'Limite efeitos caos', type: 'range', min: 20, max: 220, step: 10 },
            { key: 'chaosMaxFragments', label: 'Limite fragmentos', type: 'range', min: 0, max: 220, step: 10 },
            { key: 'decorativeRenderDistance', label: 'Distancia decorativos', type: 'range', min: 60, max: 260, step: 5 },
            { key: 'distantUpdateReduction', label: 'Atualizacao distante reduzida', type: 'checkbox' },
            { key: 'maxActiveObjects', label: 'Limite objetos ativos', type: 'range', min: 60, max: 360, step: 10 },
            { key: 'showFps', label: 'Mostrar FPS', type: 'checkbox' },
            { key: 'showStats', label: 'Mostrar estatisticas', type: 'checkbox' },
            { key: 'showFpsCounter', label: 'Contador FPS na tela', type: 'checkbox' },
            { key: 'showFrameTimeLine', label: 'Linha frame time na tela', type: 'checkbox' }
        ]
    }
];

let activePanel = null;

function cloneSettings(settings) {
    return JSON.parse(JSON.stringify(settings || {}));
}

function normalizeValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
    return value;
}

export function loadSettings(defaults = DEFAULT_SETTINGS) {
    const merged = { ...DEFAULT_SETTINGS, ...defaults };
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return { ...merged, ...saved };
    } catch (error) {
        console.warn('Nao foi possivel carregar configuracoes salvas.', error);
        return merged;
    }
}

export function saveSettings(settings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn('Nao foi possivel salvar configuracoes.', error);
    }
}

export function resetSettings(defaults = DEFAULT_SETTINGS) {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.warn('Nao foi possivel limpar configuracoes.', error);
    }
    return { ...DEFAULT_SETTINGS, ...defaults };
}

export function applySettings(settings, patch = {}) {
    const next = { ...settings, ...patch };
    if (patch.graphicsPreset && GRAPHICS_PRESETS[patch.graphicsPreset]) {
        Object.assign(next, GRAPHICS_PRESETS[patch.graphicsPreset]);
    }
    return next;
}

function formatValue(value, control) {
    if (control.format === 'percent') return `${Math.round(Number(value || 0) * 100)}%`;
    if (typeof value === 'number') return Number(value).toFixed(value < 0.1 ? 3 : 2).replace(/\.00$/, '');
    return value;
}

function createControl(control, settings, onChange) {
    const id = `settings-${control.key}`;
    if (control.type === 'button') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'settings-command-button';
        button.innerHTML = `<i class="fas fa-seedling"></i> ${control.label}`;
        button.addEventListener('click', () => {
            onChange(control.key, Date.now());
        });
        return { element: button, setValue: () => {}, input: button };
    }

    const label = document.createElement('label');
    label.className = control.type === 'checkbox' ? 'settings-toggle-row' : 'settings-control-row';
    label.htmlFor = id;

    const text = document.createElement('span');
    text.textContent = control.label;
    label.appendChild(text);

    let readout = null;
    let input;
    if (control.type === 'select') {
        input = document.createElement('select');
        control.options.forEach(([value, optionLabel]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = optionLabel;
            input.appendChild(option);
        });
    } else {
        input = document.createElement('input');
        input.type = control.type;
        if (control.type === 'range') {
            input.min = control.min;
            input.max = control.max;
            input.step = control.step;
            readout = document.createElement('strong');
            readout.dataset.readoutFor = control.key;
            label.appendChild(readout);
        }
    }
    input.id = id;
    input.dataset.settingKey = control.key;

    const setValue = (value) => {
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else input.value = value;
        if (readout) readout.textContent = formatValue(value, control);
    };
    setValue(settings[control.key]);

    input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
        const rawValue = input.type === 'checkbox' ? input.checked : input.value;
        const value = normalizeValue(rawValue);
        if (readout) readout.textContent = formatValue(value, control);
        onChange(control.key, value);
    });

    label.appendChild(input);
    return { element: label, setValue, input };
}

function createStatsBlock() {
    const block = document.createElement('div');
    block.className = 'settings-stats';
    block.innerHTML = `
        <div><span>FPS</span><strong data-stat="fps">--</strong></div>
        <div><span>Dinos ativos</span><strong data-stat="activeDinos">--</strong></div>
        <div><span>Particulas</span><strong data-stat="particles">--</strong></div>
        <div><span>Caos ativo</span><strong data-stat="chaosObjects">--</strong></div>
        <div><span>Fragmentos</span><strong data-stat="chaosFragments">--</strong></div>
        <div><span>Vegetacao</span><strong data-stat="vegetationObjects">--</strong></div>
        <div><span>Decorativos</span><strong data-stat="decorativeObjects">--</strong></div>
        <div><span>Resolucao interna</span><strong data-stat="internalResolution">--</strong></div>
    `;
    return block;
}

function injectStyles() {
    if (document.getElementById('settings-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'settings-panel-styles';
    style.textContent = `
        .settings-panel {
            right: 20px;
            transform: none;
            width: min(360px, calc(100vw - 28px));
        }

        .settings-panel:not([open]) {
            display: none;
        }

        .settings-section {
            border: 1px solid rgba(120,165,255,0.12);
            border-radius: 8px;
            overflow: hidden;
            background: rgba(3, 8, 22, 0.28);
        }

        .settings-section summary {
            padding: 10px 12px;
            font-size: 0.76rem;
            color: #b8cbff;
            border-bottom: 1px solid rgba(120,165,255,0.1);
        }

        .settings-section[open] summary { border-bottom-color: rgba(120,165,255,0.16); }

        .settings-section-body {
            display: grid;
            gap: 9px;
            padding: 10px 12px 12px;
        }

        .settings-control-row {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 8px;
            align-items: center;
            font-size: 0.75rem;
            color: rgba(240,245,255,0.88);
        }

        .settings-control-row input[type="range"],
        .settings-control-row select {
            grid-column: 1 / -1;
        }

        .settings-toggle-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            font-size: 0.75rem;
            color: rgba(240,245,255,0.88);
        }

        .settings-toggle-row input {
            width: 18px;
            height: 18px;
            accent-color: #7ca8ff;
        }

        .settings-note {
            font-size: 0.68rem;
            line-height: 1.35;
            color: rgba(220,230,255,0.62);
        }

        .settings-actions {
            display: grid;
            gap: 8px;
            grid-template-columns: 1fr;
        }

        .settings-actions button {
            width: 100%;
            justify-content: center;
            border-radius: 8px;
            font-size: 0.78rem;
            padding: 10px 12px;
        }

        .settings-command-button {
            width: 100%;
            justify-content: center;
            border-radius: 8px;
            font-size: 0.76rem;
            padding: 9px 12px;
        }

        .settings-stats {
            display: grid;
            gap: 6px;
            font-size: 0.72rem;
            color: rgba(240,245,255,0.78);
        }

        .settings-stats div {
            display: flex;
            justify-content: space-between;
            gap: 8px;
        }

        body.wallpaper-mode .settings-panel {
            opacity: 0;
            pointer-events: none;
        }

        @media (max-width: 980px) {
            .settings-panel {
                right: 14px;
                top: 88px;
            }
        }

        @media (max-width: 600px) {
            .settings-panel {
                right: 14px;
                bottom: 96px;
                top: auto;
                max-height: 42vh;
            }
        }
    `;
    document.head.appendChild(style);
}

export function createSettingsPanel({ initialSettings = {}, onSettingsChanged, onReset, getStats } = {}) {
    injectStyles();
    let settings = { ...DEFAULT_SETTINGS, ...initialSettings };
    const controls = new Map();

    const panel = document.createElement('details');
    panel.className = 'editor-panel settings-panel';
    panel.open = false;
    panel.innerHTML = `<summary><span><i class="fas fa-sliders-h"></i> CONFIGURACOES</span><i class="fas fa-chevron-down"></i></summary>`;

    const body = document.createElement('div');
    body.className = 'panel-body';
    panel.appendChild(body);

    const notify = (key, value) => {
        settings = applySettings(settings, { [key]: value });
        saveSettings(settings);
        syncControls(settings);
        onSettingsChanged?.(cloneSettings(settings), { key });
    };

    CONTROL_SECTIONS.forEach((section, sectionIndex) => {
        const details = document.createElement('details');
        details.className = 'settings-section';
        details.open = sectionIndex < 2;
        details.innerHTML = `<summary>${section.title}</summary>`;
        const sectionBody = document.createElement('div');
        sectionBody.className = 'settings-section-body';
        section.controls.forEach((control) => {
            const created = createControl(control, settings, notify);
            controls.set(control.key, { ...control, ...created });
            sectionBody.appendChild(created.element);
        });
        details.appendChild(sectionBody);
        body.appendChild(details);
    });

    const note = document.createElement('p');
    note.className = 'settings-note';
    note.textContent = 'Otimizacao automatica desligada: o app nao reduz qualidade, densidade, particulas ou resolucao sozinho.';
    body.appendChild(note);

    const stats = createStatsBlock();
    body.appendChild(stats);

    const actions = document.createElement('div');
    actions.className = 'settings-actions';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.innerHTML = '<i class="fas fa-undo"></i> RESTAURAR PADROES';
    resetButton.addEventListener('click', () => {
        settings = onReset ? onReset() : resetSettings();
        settings = { ...DEFAULT_SETTINGS, ...settings };
        saveSettings(settings);
        syncControls(settings);
        onSettingsChanged?.(cloneSettings(settings), { key: 'reset' });
    });
    actions.appendChild(resetButton);
    body.appendChild(actions);

    function syncControls(nextSettings) {
        controls.forEach((control, key) => {
            control.setValue(nextSettings[key]);
        });
        stats.style.display = nextSettings.showStats || nextSettings.showFps ? 'grid' : 'none';
    }

    function updateStats(nextStats = getStats?.() || {}) {
        const visible = settings.showStats || settings.showFps;
        stats.style.display = visible ? 'grid' : 'none';
        if (!visible) return;
        stats.querySelector('[data-stat="fps"]').textContent = settings.showFps ? Math.round(nextStats.fps || 0) : '--';
        stats.querySelector('[data-stat="activeDinos"]').textContent = settings.showStats ? (nextStats.activeDinos ?? '--') : '--';
        stats.querySelector('[data-stat="particles"]').textContent = settings.showStats ? (nextStats.particles ?? '--') : '--';
        stats.querySelector('[data-stat="chaosObjects"]').textContent = settings.showStats ? (nextStats.chaosObjects ?? '--') : '--';
        stats.querySelector('[data-stat="chaosFragments"]').textContent = settings.showStats ? (nextStats.chaosFragments ?? '--') : '--';
        stats.querySelector('[data-stat="vegetationObjects"]').textContent = settings.showStats ? (nextStats.vegetationObjects ?? '--') : '--';
        stats.querySelector('[data-stat="decorativeObjects"]').textContent = settings.showStats ? (nextStats.decorativeObjects ?? '--') : '--';
        stats.querySelector('[data-stat="internalResolution"]').textContent = `${Math.round((nextStats.internalResolution || settings.internalResolution || 1) * 100)}%`;
    }

    document.body.appendChild(panel);
    syncControls(settings);

    activePanel = {
        element: panel,
        getCurrentSettings: () => cloneSettings(settings),
        setSettings: (nextSettings, options = {}) => {
            settings = { ...settings, ...nextSettings };
            syncControls(settings);
            if (options.save) saveSettings(settings);
        },
        updateStats
    };

    return activePanel;
}

export function getCurrentSettings() {
    return activePanel?.getCurrentSettings() || loadSettings();
}
