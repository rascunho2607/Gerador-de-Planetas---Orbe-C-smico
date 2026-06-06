function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
    const span = edge1 - edge0;
    const t = clamp((value - edge0) / (Math.abs(span) < 0.0001 ? 0.0001 : span), 0, 1);
    return t * t * (3 - 2 * t);
}

function createSeededRandom(seed) {
    let state = Math.floor(Math.abs(seed || 1)) % 2147483647;
    if (state <= 0) state += 2147483646;
    return () => {
        state = state * 16807 % 2147483647;
        return (state - 1) / 2147483646;
    };
}

function hash3(x, y, z, seed) {
    const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 0.019) * 43758.5453123;
    return n - Math.floor(n);
}

function valueNoise3(normal, frequency, seed) {
    const x = normal.x * frequency;
    const y = normal.y * frequency;
    const z = normal.z * frequency;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = smoothstep(0, 1, x - ix);
    const fy = smoothstep(0, 1, y - iy);
    const fz = smoothstep(0, 1, z - iz);
    let value = 0;
    for (let dx = 0; dx <= 1; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
            for (let dz = 0; dz <= 1; dz++) {
                const wx = dx ? fx : 1 - fx;
                const wy = dy ? fy : 1 - fy;
                const wz = dz ? fz : 1 - fz;
                value += hash3(ix + dx, iy + dy, iz + dz, seed) * wx * wy * wz;
            }
        }
    }
    return value;
}

function fbm(normal, seed) {
    return (
        valueNoise3(normal, 2.2, seed) * 0.48 +
        valueNoise3(normal, 5.1, seed + 17) * 0.32 +
        valueNoise3(normal, 11.7, seed + 43) * 0.2
    );
}

function disposeObject(object) {
    if (!object) return;
    object.parent?.remove(object);
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    object.traverse((child) => {
        if (child.geometry) geometries.add(child.geometry);
        if (!child.material) return;
        const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
        childMaterials.forEach((material) => {
            if (!material) return;
            materials.add(material);
            Object.keys(material).forEach((key) => {
                const value = material[key];
                if (value?.isTexture) textures.add(value);
            });
        });
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    textures.forEach((texture) => texture.dispose?.());
    materials.forEach((material) => material.dispose?.());
}

const PRESET_LIMITS = {
    low: { trees: 130, plants: 240, patches: 280, stride: 2, renderDistance: 40, wind: false },
    medium: { trees: 230, plants: 430, patches: 460, stride: 2, renderDistance: 54, wind: true },
    high: { trees: 340, plants: 680, patches: 660, stride: 1, renderDistance: 70, wind: true },
    cinematic: { trees: 500, plants: 980, patches: 880, stride: 1, renderDistance: 88, wind: true }
};

const DENSITY_SCALE = {
    low: 0.78,
    medium: 1,
    high: 1.55,
    ultra: 2.05,
    cinematic: 5.55
};

const BIOME_VEGETATION_RULES = {
    tropical: {
        color: 0x2fb85b,
        density: 1.35,
        clustering: 0.82,
        treeChance: 0.72,
        mushroomChance: 0.05,
        clearingChance: 0.18,
        scaleMin: 0.78,
        scaleMax: 1.38,
        scenicWeight: 1.2,
        growthRate: 1.25
    },
    temperate: {
        color: 0x3f9f52,
        density: 1.0,
        clustering: 0.66,
        treeChance: 0.58,
        mushroomChance: 0.07,
        clearingChance: 0.28,
        scaleMin: 0.62,
        scaleMax: 1.08,
        scenicWeight: 1.05,
        growthRate: 1
    },
    savanna: {
        color: 0x91ad4f,
        density: 0.48,
        clustering: 0.48,
        treeChance: 0.28,
        mushroomChance: 0.01,
        clearingChance: 0.58,
        scaleMin: 0.42,
        scaleMax: 0.9,
        scenicWeight: 0.85,
        growthRate: 0.72
    },
    desert: {
        color: 0x8b8248,
        density: 0.13,
        clustering: 0.34,
        treeChance: 0.06,
        mushroomChance: 0.01,
        clearingChance: 0.78,
        scaleMin: 0.22,
        scaleMax: 0.58,
        scenicWeight: 0.35,
        growthRate: 0.32
    },
    tundra: {
        color: 0x75a185,
        density: 0.24,
        clustering: 0.42,
        treeChance: 0.1,
        mushroomChance: 0.1,
        clearingChance: 0.68,
        scaleMin: 0.2,
        scaleMax: 0.56,
        scenicWeight: 0.55,
        growthRate: 0.42
    },
    swamp: {
        color: 0x3ea66a,
        density: 1.08,
        clustering: 0.78,
        treeChance: 0.42,
        mushroomChance: 0.28,
        clearingChance: 0.22,
        scaleMin: 0.44,
        scaleMax: 1.1,
        scenicWeight: 1.1,
        growthRate: 1.15
    },
    volcanic: {
        color: 0x4d382e,
        density: 0.06,
        clustering: 0.22,
        treeChance: 0.18,
        mushroomChance: 0.02,
        clearingChance: 0.88,
        scaleMin: 0.26,
        scaleMax: 0.68,
        scenicWeight: 0.2,
        growthRate: 0.12,
        burned: true
    },
    alien: {
        color: 0x2fe0a1,
        density: 0.96,
        clustering: 0.74,
        treeChance: 0.46,
        mushroomChance: 0.34,
        clearingChance: 0.24,
        scaleMin: 0.48,
        scaleMax: 1.28,
        scenicWeight: 1.25,
        growthRate: 1.05
    },
    crystal: {
        color: 0x8ad7ff,
        density: 0.42,
        clustering: 0.6,
        treeChance: 0.16,
        mushroomChance: 0.42,
        clearingChance: 0.42,
        scaleMin: 0.28,
        scaleMax: 0.82,
        scenicWeight: 1,
        growthRate: 0.82
    },
    fungus: {
        color: 0xb678ff,
        density: 0.78,
        clustering: 0.8,
        treeChance: 0.12,
        mushroomChance: 0.64,
        clearingChance: 0.26,
        scaleMin: 0.28,
        scaleMax: 0.96,
        scenicWeight: 1.15,
        growthRate: 0.95
    }
};

const VARIETY_LEVELS = {
    low: { limit: 2, rare: 0.02, density: 0.82 },
    medium: { limit: 4, rare: 0.08, density: 1 },
    high: { limit: 7, rare: 0.16, density: 1.12 },
    cinematic: { limit: 99, rare: 0.28, density: 1.24 }
};

const BIOME_SPECIES_RULES = {
    tropical: {
        trees: ['palm', 'broadleafTall', 'denseCanopy', 'roundCanopy', 'mangrove'],
        plants: ['fern', 'bush', 'grassPatch', 'flower', 'smallMushroom']
    },
    temperate: {
        trees: ['roundCanopy', 'ovalCanopy', 'wideTree', 'smallCanopyTall', 'crookedTree', 'deadTree'],
        plants: ['grassPatch', 'bush', 'flower', 'smallMushroom', 'moss']
    },
    savanna: {
        trees: ['acacia', 'wideSparseTree', 'dryTwistedTree', 'deadTree'],
        plants: ['dryGrass', 'dryBush', 'smallCactus', 'grassPatch']
    },
    desert: {
        trees: ['cactus', 'dryTwistedTree', 'deadTree', 'burntTrunk'],
        plants: ['dryGrass', 'dryBush', 'smallCactus']
    },
    tundra: {
        trees: ['smallPine', 'snowyPine', 'smallResistantTree'],
        plants: ['moss', 'lowBush', 'dryGrass']
    },
    swamp: {
        trees: ['mangrove', 'denseCanopy', 'broadleafTall', 'crookedTree'],
        plants: ['fern', 'moss', 'bush', 'smallMushroom']
    },
    volcanic: {
        trees: ['deadTree', 'burntTrunk', 'dryTwistedTree'],
        plants: ['charredBush', 'dryGrass']
    },
    alien: {
        trees: ['glowingTree', 'giantMushroom', 'crystalPlant', 'strangeCanopy', 'plantTentacle'],
        plants: ['glowingBush', 'alienGrass', 'smallMushroom', 'smallCrystal']
    },
    crystal: {
        trees: ['crystalPlant', 'glowingTree', 'strangeCanopy'],
        plants: ['smallCrystal', 'glowingBush', 'alienGrass']
    },
    fungus: {
        trees: ['giantMushroom', 'glowingTree', 'strangeCanopy'],
        plants: ['smallMushroom', 'glowingBush', 'moss']
    }
};

const TREE_SPECIES = {
    roundCanopy: { family: 'temperate', trunk: 'trunk', crown: 'roundCrown', scale: [0.84, 1.16], trunkHeight: 1.04, crownRadius: 0.78, crownHeight: 0.78, crownLift: 0.82 },
    ovalCanopy: { family: 'temperate', trunk: 'trunk', crown: 'ovalCrown', scale: [0.74, 1.08], trunkHeight: 1.08, crownRadius: 0.62, crownHeight: 1.04, crownLift: 0.9 },
    wideTree: { family: 'temperate', trunk: 'trunk', crown: 'wideCrown', scale: [0.68, 1], trunkHeight: 0.72, crownRadius: 1.05, crownHeight: 0.58, crownLift: 0.66 },
    smallCanopyTall: { family: 'temperate', trunk: 'slimTrunk', crown: 'roundCrown', scale: [0.82, 1.22], trunkHeight: 1.45, crownRadius: 0.46, crownHeight: 0.54, crownLift: 1.1 },
    crookedTree: { family: 'temperate', trunk: 'trunk', crown: 'ovalCrown', scale: [0.66, 1.05], trunkHeight: 1.0, crownRadius: 0.58, crownHeight: 0.72, crownLift: 0.82, tilt: 0.16 },
    pineRare: { family: 'cold', trunk: 'slimTrunk', crown: 'pineCrown', scale: [0.72, 1.08], trunkHeight: 1.0, crownRadius: 0.66, crownHeight: 1.1, crownLift: 0.88 },
    palm: { family: 'tropical', trunk: 'slimTrunk', crown: 'palmCrown', scale: [0.88, 1.34], trunkHeight: 1.72, crownRadius: 0.8, crownHeight: 0.34, crownLift: 1.35, tilt: 0.1 },
    broadleafTall: { family: 'tropical', trunk: 'trunk', crown: 'wideCrown', scale: [0.95, 1.42], trunkHeight: 1.34, crownRadius: 1, crownHeight: 0.82, crownLift: 1.05 },
    denseCanopy: { family: 'tropical', trunk: 'trunk', crown: 'denseCrown', scale: [0.9, 1.34], trunkHeight: 1.04, crownRadius: 0.9, crownHeight: 0.9, crownLift: 0.88 },
    mangrove: { family: 'tropical', trunk: 'mangroveTrunk', crown: 'wideCrown', scale: [0.72, 1.08], trunkHeight: 0.92, crownRadius: 0.82, crownHeight: 0.62, crownLift: 0.72, tilt: 0.08 },
    acacia: { family: 'arid', trunk: 'trunk', crown: 'flatCrown', scale: [0.66, 1.08], trunkHeight: 0.92, crownRadius: 1.05, crownHeight: 0.36, crownLift: 0.78, tilt: 0.08 },
    wideSparseTree: { family: 'arid', trunk: 'slimTrunk', crown: 'flatCrown', scale: [0.52, 0.88], trunkHeight: 0.72, crownRadius: 0.78, crownHeight: 0.3, crownLift: 0.6 },
    dryTwistedTree: { family: 'arid', trunk: 'dryTrunk', crown: 'deadBranch', scale: [0.5, 0.84], trunkHeight: 0.84, crownRadius: 0.52, crownHeight: 0.34, crownLift: 0.72, tilt: 0.18, dead: true },
    cactus: { family: 'arid', trunk: 'cactusColumn', crown: 'cactusArm', scale: [0.7, 1.18], trunkHeight: 1.24, crownRadius: 0.42, crownHeight: 0.48, crownLift: 0.7, noCrownColor: true },
    deadTree: { family: 'dead', trunk: 'dryTrunk', crown: 'deadBranch', scale: [0.48, 0.95], trunkHeight: 1.04, crownRadius: 0.62, crownHeight: 0.42, crownLift: 0.82, dead: true, tilt: 0.12 },
    burntTrunk: { family: 'dead', trunk: 'burntTrunk', crown: null, scale: [0.4, 0.82], trunkHeight: 0.86, crownRadius: 0, crownHeight: 0, crownLift: 0, dead: true, burned: true },
    smallPine: { family: 'cold', trunk: 'slimTrunk', crown: 'pineCrown', scale: [0.46, 0.82], trunkHeight: 0.78, crownRadius: 0.52, crownHeight: 0.96, crownLift: 0.64 },
    snowyPine: { family: 'cold', trunk: 'slimTrunk', crown: 'snowyPineCrown', scale: [0.46, 0.86], trunkHeight: 0.82, crownRadius: 0.54, crownHeight: 1.0, crownLift: 0.66 },
    smallResistantTree: { family: 'cold', trunk: 'trunk', crown: 'roundCrown', scale: [0.36, 0.68], trunkHeight: 0.6, crownRadius: 0.5, crownHeight: 0.44, crownLift: 0.52 },
    glowingTree: { family: 'alien', trunk: 'darkTrunk', crown: 'glowCrown', scale: [0.76, 1.28], trunkHeight: 1.16, crownRadius: 0.72, crownHeight: 0.82, crownLift: 0.92, emissive: true },
    giantMushroom: { family: 'alien', trunk: 'mushroomStem', crown: 'mushroomCap', scale: [0.64, 1.18], trunkHeight: 0.88, crownRadius: 0.9, crownHeight: 0.38, crownLift: 0.72, emissive: true },
    crystalPlant: { family: 'alien', trunk: 'crystalStem', crown: 'crystalShard', scale: [0.58, 1.08], trunkHeight: 0.44, crownRadius: 0.64, crownHeight: 0.9, crownLift: 0.48, emissive: true },
    strangeCanopy: { family: 'alien', trunk: 'darkTrunk', crown: 'strangeCrown', scale: [0.7, 1.22], trunkHeight: 1.0, crownRadius: 0.78, crownHeight: 0.72, crownLift: 0.86, tilt: 0.08, emissive: true },
    plantTentacle: { family: 'alien', trunk: 'tentacleStem', crown: 'glowCrown', scale: [0.48, 0.92], trunkHeight: 1.05, crownRadius: 0.36, crownHeight: 0.38, crownLift: 0.98, tilt: 0.2, emissive: true }
};

const PLANT_SPECIES = {
    grassPatch: { mesh: 'grassPatch', scale: [0.22, 0.42], y: 0.38 },
    bush: { mesh: 'shrub', scale: [0.32, 0.64], y: 0.72 },
    lowBush: { mesh: 'shrub', scale: [0.2, 0.42], y: 0.42 },
    flower: { mesh: 'flower', scale: [0.22, 0.38], y: 0.78 },
    fern: { mesh: 'fern', scale: [0.28, 0.56], y: 0.58 },
    smallMushroom: { mesh: 'smallMushroom', scale: [0.18, 0.38], y: 1.0, alien: true },
    moss: { mesh: 'moss', scale: [0.26, 0.52], y: 0.18 },
    dryGrass: { mesh: 'dryGrass', scale: [0.22, 0.44], y: 0.34 },
    dryBush: { mesh: 'dryBush', scale: [0.26, 0.5], y: 0.48 },
    smallCactus: { mesh: 'smallCactus', scale: [0.22, 0.46], y: 1.0 },
    charredBush: { mesh: 'charredBush', scale: [0.22, 0.42], y: 0.42, dead: true },
    glowingBush: { mesh: 'glowingBush', scale: [0.28, 0.56], y: 0.72, alien: true },
    alienGrass: { mesh: 'alienGrass', scale: [0.22, 0.46], y: 0.44, alien: true },
    smallCrystal: { mesh: 'smallCrystal', scale: [0.24, 0.5], y: 0.82, alien: true }
};

function mix(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}

export class PlanetVegetationSystem {
    constructor({
        THREE,
        parentGroup,
        camera,
        getPlanetRadius,
        getPlanetCenter,
        getPlanetSurfaceHeight,
        settings = {}
    }) {
        this.THREE = THREE;
        this.parentGroup = parentGroup;
        this.camera = camera;
        this.getPlanetRadius = getPlanetRadius || (() => 10);
        this.getPlanetCenter = getPlanetCenter || (() => new THREE.Vector3());
        this.getPlanetSurfaceHeight = getPlanetSurfaceHeight || (() => 0);
        this.settings = { ...settings };
        this.group = null;
        this.patchPoints = null;
        this.debugPoints = null;
        this.meshes = {};
        this.instances = [];
        this.patches = [];
        this.chunks = new Map();
        this.scenicZones = [];
        this.planetData = null;
        this.elapsed = 0;
        this.rebuildTimer = 0;
        this.lodState = 'far';
        this.tempMatrix = new THREE.Matrix4();
        this.tempPosition = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();
        this.tempScale = new THREE.Vector3();
        this.tempLocalPosition = new THREE.Vector3();
        this.tempSurfaceQuaternion = new THREE.Quaternion();
        this.tempYawQuaternion = new THREE.Quaternion();
        this.tempTreeBase = new THREE.Vector3();
        this.tempTreeTop = new THREE.Vector3();
        this.tempCanopyCenter = new THREE.Vector3();
        this.up = new THREE.Vector3(0, 1, 0);
        this.cameraLocal = new THREE.Vector3();
        this.debugTreeLines = null;
        this.debugClusterPoints = null;
        this.debugTreeLineLimit = 96;
    }

    generateForPlanet(planetData = {}) {
        this.dispose();
        this.planetData = planetData;
        if (!this.settings.vegetationEnabled) return;
        const profileType = planetData.profile?.type || 'terrestrial';
        if (['star', 'blackhole', 'gas'].includes(profileType)) return;

        this.group = new this.THREE.Group();
        this.group.name = 'PlanetVegetation';
        this.parentGroup?.add(this.group);
        this.generateScenicVegetationZones();
        this.createInstancedMeshes();
        this.generateVegetationInstances();
        this.generateBiomePatches();
        this.createClusterDebugPoints();
        this.rebuildAllBuffers({ force: true });
    }

    createInstancedMeshes() {
        const THREE = this.THREE;
        const limits = this.getLimits();
        const treeCapacity = Math.max(12, limits.trees);
        const plantCapacity = Math.max(24, limits.plants);
        const materials = {
            bark: new THREE.MeshStandardMaterial({ color: 0x6a4a2f, roughness: 0.9, metalness: 0.02 }),
            dryBark: new THREE.MeshStandardMaterial({ color: 0x6f5a3d, roughness: 0.95, metalness: 0.01 }),
            burnt: new THREE.MeshStandardMaterial({ color: 0x2f2924, roughness: 0.96, metalness: 0.02 }),
            leaf: new THREE.MeshStandardMaterial({ color: 0x38a855, roughness: 0.84, metalness: 0.01 }),
            snowLeaf: new THREE.MeshStandardMaterial({ color: 0xd9eef2, roughness: 0.72, metalness: 0.01 }),
            cactus: new THREE.MeshStandardMaterial({ color: 0x3f9f63, roughness: 0.88, metalness: 0.01 }),
            alienGlow: new THREE.MeshStandardMaterial({ color: 0x59ffd0, roughness: 0.58, metalness: 0.03, emissive: 0x23c6a3, emissiveIntensity: 0.38 }),
            fungus: new THREE.MeshStandardMaterial({ color: 0xcaa3ff, roughness: 0.76, metalness: 0.02, emissive: 0x231044, emissiveIntensity: 0.18 }),
            crystal: new THREE.MeshStandardMaterial({ color: 0x9de8ff, roughness: 0.34, metalness: 0.12, transparent: true, opacity: 0.78, emissive: 0x2876ff, emissiveIntensity: 0.28 }),
            flower: new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.78, metalness: 0.01 })
        };
        const geometries = {
            trunk: new THREE.CylinderGeometry(0.055, 0.078, 1, 5, 1),
            slimTrunk: new THREE.CylinderGeometry(0.035, 0.065, 1, 5, 1),
            dryTrunk: new THREE.CylinderGeometry(0.032, 0.075, 1, 5, 1),
            burntTrunk: new THREE.CylinderGeometry(0.04, 0.07, 1, 5, 1),
            mangroveTrunk: new THREE.CylinderGeometry(0.045, 0.1, 1, 5, 1),
            darkTrunk: new THREE.CylinderGeometry(0.045, 0.078, 1, 6, 1),
            cactusColumn: new THREE.CylinderGeometry(0.12, 0.12, 1, 7, 1),
            mushroomStem: new THREE.CylinderGeometry(0.13, 0.08, 1, 8, 1),
            crystalStem: new THREE.ConeGeometry(0.18, 1, 5, 1),
            tentacleStem: new THREE.CylinderGeometry(0.055, 0.085, 1, 7, 1),
            roundCrown: new THREE.DodecahedronGeometry(0.54, 0),
            ovalCrown: new THREE.SphereGeometry(0.48, 8, 6),
            wideCrown: new THREE.SphereGeometry(0.52, 8, 5),
            denseCrown: new THREE.IcosahedronGeometry(0.56, 0),
            pineCrown: new THREE.ConeGeometry(0.48, 1, 7, 1),
            snowyPineCrown: new THREE.ConeGeometry(0.5, 1, 7, 1),
            palmCrown: new THREE.ConeGeometry(0.62, 0.28, 9, 1),
            flatCrown: new THREE.CylinderGeometry(0.58, 0.7, 0.32, 8, 1),
            deadBranch: new THREE.ConeGeometry(0.5, 0.34, 5, 1),
            cactusArm: new THREE.CylinderGeometry(0.08, 0.08, 1, 7, 1),
            glowCrown: new THREE.IcosahedronGeometry(0.54, 0),
            mushroomCap: new THREE.SphereGeometry(0.62, 9, 5),
            crystalShard: new THREE.OctahedronGeometry(0.62, 0),
            strangeCrown: new THREE.TorusKnotGeometry(0.34, 0.12, 24, 5),
            shrub: new THREE.DodecahedronGeometry(0.34, 0),
            grassPatch: new THREE.ConeGeometry(0.24, 0.42, 5, 1),
            flower: new THREE.ConeGeometry(0.2, 0.34, 6, 1),
            fern: new THREE.ConeGeometry(0.28, 0.5, 7, 1),
            smallMushroom: new THREE.CylinderGeometry(0.18, 0.08, 0.42, 7, 1),
            moss: new THREE.SphereGeometry(0.28, 7, 4),
            dryGrass: new THREE.ConeGeometry(0.2, 0.38, 5, 1),
            dryBush: new THREE.DodecahedronGeometry(0.28, 0),
            smallCactus: new THREE.CylinderGeometry(0.12, 0.1, 0.55, 7, 1),
            charredBush: new THREE.DodecahedronGeometry(0.25, 0),
            glowingBush: new THREE.IcosahedronGeometry(0.3, 0),
            alienGrass: new THREE.ConeGeometry(0.22, 0.46, 6, 1),
            smallCrystal: new THREE.OctahedronGeometry(0.32, 0)
        };

        const meshDefs = {
            trunk: ['trunk', 'bark', treeCapacity],
            slimTrunk: ['slimTrunk', 'bark', treeCapacity],
            dryTrunk: ['dryTrunk', 'dryBark', treeCapacity],
            burntTrunk: ['burntTrunk', 'burnt', treeCapacity],
            mangroveTrunk: ['mangroveTrunk', 'bark', treeCapacity],
            darkTrunk: ['darkTrunk', 'burnt', treeCapacity],
            cactusColumn: ['cactusColumn', 'cactus', treeCapacity],
            mushroomStem: ['mushroomStem', 'fungus', treeCapacity],
            crystalStem: ['crystalStem', 'crystal', treeCapacity],
            tentacleStem: ['tentacleStem', 'alienGlow', treeCapacity],
            roundCrown: ['roundCrown', 'leaf', treeCapacity],
            ovalCrown: ['ovalCrown', 'leaf', treeCapacity],
            wideCrown: ['wideCrown', 'leaf', treeCapacity],
            denseCrown: ['denseCrown', 'leaf', treeCapacity],
            pineCrown: ['pineCrown', 'leaf', treeCapacity],
            snowyPineCrown: ['snowyPineCrown', 'snowLeaf', treeCapacity],
            palmCrown: ['palmCrown', 'leaf', treeCapacity],
            flatCrown: ['flatCrown', 'leaf', treeCapacity],
            deadBranch: ['deadBranch', 'dryBark', treeCapacity],
            cactusArm: ['cactusArm', 'cactus', treeCapacity],
            glowCrown: ['glowCrown', 'alienGlow', treeCapacity],
            mushroomCap: ['mushroomCap', 'fungus', treeCapacity],
            crystalShard: ['crystalShard', 'crystal', treeCapacity],
            strangeCrown: ['strangeCrown', 'alienGlow', treeCapacity],
            shrub: ['shrub', 'leaf', plantCapacity],
            grassPatch: ['grassPatch', 'leaf', plantCapacity],
            flower: ['flower', 'flower', plantCapacity],
            fern: ['fern', 'leaf', plantCapacity],
            smallMushroom: ['smallMushroom', 'fungus', plantCapacity],
            moss: ['moss', 'leaf', plantCapacity],
            dryGrass: ['dryGrass', 'dryBark', plantCapacity],
            dryBush: ['dryBush', 'dryBark', plantCapacity],
            smallCactus: ['smallCactus', 'cactus', plantCapacity],
            charredBush: ['charredBush', 'burnt', plantCapacity],
            glowingBush: ['glowingBush', 'alienGlow', plantCapacity],
            alienGrass: ['alienGrass', 'alienGlow', plantCapacity],
            smallCrystal: ['smallCrystal', 'crystal', plantCapacity]
        };

        Object.entries(meshDefs).forEach(([key, [geometryKey, materialKey, capacity]]) => {
            const geometry = geometries[geometryKey];
            const baseMaterial = materials[materialKey];
            if (!this.isValidRenderableGeometry(geometry) || !baseMaterial) {
                console.warn('Tipo de vegetacao com geometria/material invalido:', key, geometryKey, materialKey, geometry, baseMaterial);
                geometry?.dispose?.();
                return;
            }
            const material = baseMaterial.clone();
            this.meshes[key] = new THREE.InstancedMesh(geometry, material, capacity);
            this.initializeInstancedColor(this.meshes[key], capacity);
        });
        Object.values(materials).forEach((material) => material.dispose());

        Object.values(this.meshes).forEach((mesh) => {
            mesh.count = 0;
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            this.group.add(mesh);
        });
        this.createDebugTreeLines();
    }

    isValidRenderableGeometry(geometry) {
        const position = geometry?.attributes?.position;
        return Boolean(geometry && geometry.attributes && position && position.array);
    }

    initializeInstancedColor(mesh, capacity) {
        const THREE = this.THREE;
        const colors = new Float32Array(Math.max(1, capacity) * 3);
        for (let i = 0; i < colors.length; i++) colors[i] = 1;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }

    createDebugTreeLines() {
        const THREE = this.THREE;
        const geometry = new THREE.BufferGeometry();
        const vertexCount = this.debugTreeLineLimit * 4;
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
        geometry.setDrawRange(0, 0);
        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        this.debugTreeLines = new THREE.LineSegments(geometry, material);
        this.debugTreeLines.name = 'VegetationTreeDebugLines';
        this.debugTreeLines.visible = Boolean(this.settings.vegetationDebugBiomes);
        this.debugTreeLines.frustumCulled = false;
        this.group.add(this.debugTreeLines);
    }

    generateScenicVegetationZones() {
        this.scenicZones = [];
        const seed = this.planetData.seed || 1;
        const random = createSeededRandom(seed + 15031);
        const quality = PRESET_LIMITS[this.settings.vegetationQuality] || PRESET_LIMITS.medium;
        const scenicEnabled = this.settings.vegetationScenicEnabled !== false;
        const scenicScale = scenicEnabled ? Number(this.settings.vegetationScenicIntensity || 0.75) : 0.18;
        const count = Math.max(6, Math.floor((quality.patches || 360) / 58));
        const types = ['forest', 'clearing', 'grove', 'crescent', 'valley'];
        for (let i = 0; i < count; i++) {
            const normal = this.fibonacciNormal(i + Math.floor(random() * 41), count * 3, random);
            const type = types[Math.floor(random() * types.length)];
            this.scenicZones.push({
                normal,
                type,
                radius: mix(0.16, 0.38, random()) * mix(0.72, 1.18, scenicScale),
                strength: mix(0.35, 1, random()) * scenicScale,
                phase: random() * Math.PI * 2
            });
        }
    }

    generateForestClusters() {
        this.generateScenicVegetationZones();
        return this.scenicZones;
    }

    createClusterDebugPoints() {
        if (!this.group || !this.scenicZones.length) return;
        const THREE = this.THREE;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.scenicZones.length * 3), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.scenicZones.length * 3), 3));
        const positions = geometry.attributes.position.array;
        const colors = geometry.attributes.color.array;
        const radius = this.getPlanetRadius();
        this.scenicZones.forEach((zone, index) => {
            const idx = index * 3;
            const height = this.getPlanetSurfaceHeight(zone.normal);
            const point = zone.normal.clone().multiplyScalar(radius + height + 0.18);
            positions[idx] = point.x;
            positions[idx + 1] = point.y;
            positions[idx + 2] = point.z;
            const color = zone.type === 'clearing' ? new THREE.Color(0xffd166) : zone.type === 'crescent' ? new THREE.Color(0x8ad7ff) : new THREE.Color(0x6dff8d);
            colors[idx] = color.r;
            colors[idx + 1] = color.g;
            colors[idx + 2] = color.b;
        });
        this.debugClusterPoints = new THREE.Points(
            geometry,
            new THREE.PointsMaterial({ size: 0.78, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })
        );
        this.debugClusterPoints.name = 'VegetationClusterDebug';
        this.debugClusterPoints.visible = Boolean(this.settings.vegetationDebugClusters);
        this.debugClusterPoints.frustumCulled = false;
        this.group.add(this.debugClusterPoints);
    }

    getLimits() {
        const preset = PRESET_LIMITS[this.settings.vegetationQuality] || PRESET_LIMITS[this.settings.graphicsPreset] || PRESET_LIMITS.medium;
        const density = DENSITY_SCALE[this.settings.vegetationDensity] || 1;
        const variety = this.getVarietyProfile();
        const renderDistance = Number(this.settings.vegetationRenderDistance || preset.renderDistance);
        return {
            trees: Math.max(12, Math.floor(preset.trees * density * variety.density)),
            plants: Math.max(24, Math.floor(preset.plants * density * variety.density)),
            patches: Math.max(64, Math.floor(preset.patches * density * variety.density)),
            stride: preset.stride,
            renderDistance,
            wind: preset.wind
        };
    }

    getVarietyProfile() {
        const named = this.settings.vegetationVarietyLevel;
        if (VARIETY_LEVELS[named]) return VARIETY_LEVELS[named];
        const numeric = Number(this.settings.vegetationBiomeVariety || 1);
        if (numeric < 0.72) return VARIETY_LEVELS.low;
        if (numeric > 1.32) return VARIETY_LEVELS.cinematic;
        if (numeric > 1.08) return VARIETY_LEVELS.high;
        return VARIETY_LEVELS.medium;
    }

    generateVegetationInstances() {
        const THREE = this.THREE;
        const seed = this.planetData.seed || 1;
        const random = createSeededRandom(seed + 7301);
        const limits = this.getLimits();
        const lowPlantsEnabled = this.settings.vegetationLowPlantsEnabled !== false;
        const desired = limits.trees + (lowPlantsEnabled ? limits.plants : 0);
        const maxAttempts = desired * 7;
        let accepted = 0;
        let treeCount = 0;
        let plantCount = 0;

        for (let i = 0; i < maxAttempts && accepted < desired; i++) {
            const normal = this.fibonacciNormal(i + Math.floor(random() * 97), maxAttempts, random);
            const biome = this.evaluateBiome(normal);
            if (biome.density <= 0.035 || random() > biome.density) continue;
            const type = this.pickVegetationType(biome, random);
            if (type !== 'tree' && !lowPlantsEnabled) continue;
            if (type === 'tree' && treeCount >= limits.trees) continue;
            if (type !== 'tree' && plantCount >= limits.plants) continue;
            const species = this.pickSpeciesForType(type, biome, random);
            if (!species) continue;
            const height = this.getPlanetSurfaceHeight(normal);
            const chunkId = this.chunkIdForNormal(normal);
            const speciesDef = type === 'tree' ? TREE_SPECIES[species] : PLANT_SPECIES[species];
            const instance = {
                normal: normal.clone(),
                height,
                chunkId,
                type,
                species,
                biome: biome.name,
                color: biome.color.clone(),
                random: random(),
                spin: random() * Math.PI * 2,
                scale: this.scaleForType(type, random, biome),
                growth: this.settings.vegetationGrowthEnabled ? random() * 0.22 : 1,
                targetGrowth: 0.86 + random() * 0.22,
                state: biome.rule.burned || speciesDef?.burned ? 'burned' : 'alive',
                scenic: biome.scenic,
                density: biome.density,
                windPhase: random() * Math.PI * 2
            };
            this.instances.push(instance);
            if (!this.chunks.has(chunkId)) this.chunks.set(chunkId, { id: chunkId, count: 0, normal: new THREE.Vector3() });
            const chunk = this.chunks.get(chunkId);
            chunk.count++;
            chunk.normal.add(normal).normalize();
            if (type === 'tree') treeCount++;
            else plantCount++;
            accepted++;
        }
    }

    generateBiomePatches() {
        const THREE = this.THREE;
        const seed = this.planetData.seed || 1;
        const random = createSeededRandom(seed + 9109);
        const limits = this.getLimits();
        for (let i = 0; i < limits.patches; i++) {
            const normal = this.fibonacciNormal(i, limits.patches, random);
            const biome = this.evaluateBiome(normal);
            if (biome.density <= 0.035 || random() > biome.density * 1.35) continue;
            this.patches.push({
                normal,
                biome: biome.name,
                color: biome.color.clone(),
                strength: biome.density,
                state: biome.rule.burned ? 'burned' : 'alive'
            });
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, this.patches.length) * 3), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(1, this.patches.length) * 3), 3));
        const material = new THREE.PointsMaterial({
            size: 0.38,
            transparent: true,
            opacity: 0.62,
            vertexColors: true,
            depthWrite: false
        });
        this.patchPoints = new THREE.Points(geometry, material);
        this.patchPoints.name = 'VegetationBiomePatches';
        this.patchPoints.frustumCulled = false;
        this.group.add(this.patchPoints);

        const debugGeometry = new THREE.BufferGeometry();
        debugGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, this.patches.length) * 3), 3));
        debugGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(1, this.patches.length) * 3), 3));
        this.debugPoints = new THREE.Points(debugGeometry, new THREE.PointsMaterial({ size: 0.52, vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false }));
        this.debugPoints.name = 'VegetationBiomeDebug';
        this.debugPoints.visible = Boolean(this.settings.vegetationDebugBiomes);
        this.debugPoints.frustumCulled = false;
        this.group.add(this.debugPoints);
    }

    fibonacciNormal(index, total, random) {
        const THREE = this.THREE;
        const offset = 2 / Math.max(1, total);
        const increment = Math.PI * (3 - Math.sqrt(5));
        const y = ((index * offset) - 1) + offset * 0.5;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const phi = ((index + (random ? random() : 0)) % total) * increment;
        return new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r).normalize();
    }

    evaluateBiome(normal) {
        const THREE = this.THREE;
        const profileType = this.planetData.profile?.type || 'terrestrial';
        const seed = this.planetData.seed || 1;
        const latitude = Math.abs(normal.y);
        const height = this.getPlanetSurfaceHeight(normal);
        const radius = this.getPlanetRadius();
        const moisture = fbm(normal, seed + 101);
        const fertilityNoise = fbm(normal, seed + 303);
        const temperature = clamp(1 - latitude * 0.92 + valueNoise3(normal, 1.4, seed + 404) * 0.34 - 0.12, 0, 1);
        const slope = this.estimateSlope(normal);
        const roughness = valueNoise3(normal, 16.5, seed + 909);
        const heightPenalty = smoothstep(0.16, 0.01, Math.abs(height / Math.max(1, radius)));
        const slopePenalty = smoothstep(0.62, 0.1, slope);
        const valleyScore = smoothstep(0.09, -0.035, height / Math.max(1, radius)) * smoothstep(0.44, 0.06, slope);
        const scenic = this.getScenicInfluence(normal);
        const biomeNames = this.classifyBiome({ profileType, moisture, temperature, latitude, fertilityNoise });
        const primaryRule = this.getVegetationRulesForBiome(biomeNames.primary);
        const secondaryRule = this.getVegetationRulesForBiome(biomeNames.secondary);
        const blend = biomeNames.blend;
        const forestIntensity = Number(this.settings.vegetationForestIntensity || 1);
        const variety = Number(this.settings.vegetationBiomeVariety || 1);
        const baseFertility = (moisture * 0.55 + fertilityNoise * 0.28 + temperature * 0.12 + valleyScore * 0.22) * heightPenalty * slopePenalty;
        const ruleDensity = mix(primaryRule.density, secondaryRule.density, blend);
        const ruleClustering = mix(primaryRule.clustering, secondaryRule.clustering, blend);
        const clearingChance = mix(primaryRule.clearingChance, secondaryRule.clearingChance, blend);
        const clusterNoise = fbm(normal, seed + 707);
        const broadForest = smoothstep(0.34, 0.78, clusterNoise);
        const groveNoise = valueNoise3(normal, 8.5, seed + 808);
        const groveCluster = smoothstep(0.48, 0.86, groveNoise);
        const naturalClearing = smoothstep(1 - clearingChance * 0.55, 1, valueNoise3(normal, 6.4, seed + 606));
        const exposurePenalty = mix(1, 0.58, smoothstep(0.08, 0.18, Math.abs(height / Math.max(1, radius))) * roughness);
        let density = baseFertility * ruleDensity;
        density *= mix(0.52, 1.62, broadForest * ruleClustering);
        density *= mix(0.78, 1.22, groveCluster * variety);
        density *= mix(1, 0.22, naturalClearing);
        density *= mix(1, 1.48, scenic.forest * forestIntensity * mix(primaryRule.scenicWeight, secondaryRule.scenicWeight, blend));
        density *= mix(1, 0.14, scenic.clearing);
        density *= exposurePenalty;
        if (biomeNames.primary === 'savanna' || biomeNames.primary === 'desert') density *= mix(0.78, 1.25, valleyScore);

        const color = new THREE.Color(primaryRule.color).lerp(new THREE.Color(secondaryRule.color), blend);
        color.offsetHSL(0, 0.03 * variety, (scenic.forest - scenic.clearing) * 0.035);

        const rule = {
            ...primaryRule,
            density: ruleDensity,
            clustering: ruleClustering,
            clearingChance,
            treeChance: mix(primaryRule.treeChance, secondaryRule.treeChance, blend),
            mushroomChance: mix(primaryRule.mushroomChance, secondaryRule.mushroomChance, blend),
            scaleMin: mix(primaryRule.scaleMin, secondaryRule.scaleMin, blend),
            scaleMax: mix(primaryRule.scaleMax, secondaryRule.scaleMax, blend),
            growthRate: mix(primaryRule.growthRate, secondaryRule.growthRate, blend),
            burned: primaryRule.burned || secondaryRule.burned && blend > 0.45
        };

        return {
            name: biomeNames.primary,
            secondaryName: biomeNames.secondary,
            blend,
            color,
            rule,
            fertility: clamp(baseFertility, 0, 1),
            density: clamp(density, 0, 1),
            moisture,
            temperature,
            slope,
            roughness,
            valleyScore,
            scenic
        };
    }

    classifyBiome({ profileType, moisture, temperature, latitude, fertilityNoise }) {
        if (profileType === 'volcanic') return { primary: 'volcanic', secondary: 'desert', blend: 0.18 };
        if (profileType === 'ice') return { primary: 'tundra', secondary: moisture > 0.62 ? 'fungus' : 'savanna', blend: clamp((temperature - 0.26) * 1.8, 0, 0.38) };
        if (profileType === 'desert') return { primary: moisture > 0.66 ? 'savanna' : 'desert', secondary: moisture > 0.66 ? 'temperate' : 'savanna', blend: smoothstep(0.56, 0.78, moisture) * 0.45 };
        if (profileType === 'alien' && this.settings.vegetationAlienEnabled) {
            return { primary: moisture > 0.52 ? 'alien' : 'crystal', secondary: fertilityNoise > 0.72 ? 'fungus' : 'savanna', blend: smoothstep(0.42, 0.72, fertilityNoise) * 0.5 };
        }
        if (profileType === 'oceanic') {
            return { primary: moisture > 0.58 ? 'swamp' : 'tropical', secondary: moisture > 0.58 ? 'tropical' : 'savanna', blend: smoothstep(0.42, 0.66, moisture) * 0.42 };
        }
        if (latitude > 0.74 || temperature < 0.28) return { primary: 'tundra', secondary: 'temperate', blend: smoothstep(0.18, 0.42, temperature) * 0.45 };
        if (moisture > 0.72 && temperature > 0.48) return { primary: 'tropical', secondary: 'swamp', blend: smoothstep(0.72, 0.92, moisture) * 0.38 };
        if (moisture > 0.48) return { primary: 'temperate', secondary: temperature > 0.62 ? 'tropical' : 'savanna', blend: smoothstep(0.48, 0.72, moisture) * 0.38 };
        if (moisture > 0.28) return { primary: 'savanna', secondary: 'temperate', blend: smoothstep(0.28, 0.5, moisture) * 0.34 };
        if (this.settings.vegetationAlienEnabled && fertilityNoise > 0.9) return { primary: 'fungus', secondary: 'desert', blend: 0.22 };
        return { primary: 'desert', secondary: 'savanna', blend: smoothstep(0.18, 0.34, moisture) * 0.38 };
    }

    getVegetationRulesForBiome(biome) {
        return BIOME_VEGETATION_RULES[biome] || BIOME_VEGETATION_RULES.temperate;
    }

    getBiomeAtPoint(positionOrNormal) {
        if (!positionOrNormal) return null;
        const normal = positionOrNormal.clone ? positionOrNormal.clone().normalize() : new this.THREE.Vector3(positionOrNormal.x, positionOrNormal.y, positionOrNormal.z).normalize();
        return this.evaluateBiome(normal);
    }

    getVegetationDensityAtPoint(positionOrNormal, biomeData = null) {
        return (biomeData || this.getBiomeAtPoint(positionOrNormal))?.density || 0;
    }

    getScenicInfluence(normal) {
        const influence = { forest: 0, clearing: 0, scenic: 0 };
        if (!this.scenicZones.length) return influence;
        this.scenicZones.forEach((zone) => {
            const angular = Math.acos(clamp(zone.normal.dot(normal), -1, 1));
            if (angular > zone.radius) return;
            const local = angular / zone.radius;
            const falloff = smoothstep(1, 0, local) * zone.strength;
            if (zone.type === 'clearing') {
                influence.clearing = Math.max(influence.clearing, falloff);
            } else if (zone.type === 'crescent') {
                const ring = 1 - Math.abs(local - 0.58) / 0.32;
                influence.forest = Math.max(influence.forest, clamp(ring, 0, 1) * falloff);
                influence.clearing = Math.max(influence.clearing, smoothstep(0.36, 0, local) * falloff * 0.72);
            } else if (zone.type === 'grove') {
                influence.forest = Math.max(influence.forest, falloff * 0.82);
            } else {
                influence.forest = Math.max(influence.forest, falloff);
            }
            influence.scenic = Math.max(influence.scenic, falloff);
        });
        return influence;
    }

    estimateSlope(normal) {
        const THREE = this.THREE;
        const helper = Math.abs(normal.y) > 0.88 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const tangentA = new THREE.Vector3().crossVectors(helper, normal).normalize();
        const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
        const sampleAngle = 0.045;
        const base = this.getPlanetSurfaceHeight(normal);
        const a = this.getPlanetSurfaceHeight(normal.clone().addScaledVector(tangentA, sampleAngle).normalize());
        const b = this.getPlanetSurfaceHeight(normal.clone().addScaledVector(tangentB, sampleAngle).normalize());
        return (Math.abs(base - a) + Math.abs(base - b)) / Math.max(0.001, this.getPlanetRadius() * sampleAngle);
    }

    pickVegetationType(biome, random) {
        const rule = biome.rule || this.getVegetationRulesForBiome(biome.name);
        const scenicTreeBoost = biome.scenic?.forest ? biome.scenic.forest * 0.16 : 0;
        const openPenalty = biome.scenic?.clearing ? biome.scenic.clearing * 0.18 : 0;
        const lowPlantsEnabled = this.settings.vegetationLowPlantsEnabled !== false;
        const mushroomChance = lowPlantsEnabled ? clamp(rule.mushroomChance * (biome.name === 'swamp' ? 1.18 : 1), 0, 0.82) : 0;
        const roll = random();
        if (roll < mushroomChance) return 'plant';
        if (roll < mushroomChance + clamp(rule.treeChance + scenicTreeBoost - openPenalty, 0.02, 0.86)) return 'tree';
        return lowPlantsEnabled ? 'plant' : 'tree';
    }

    pickSpeciesForType(type, biome, random) {
        const rules = BIOME_SPECIES_RULES[biome.name] || BIOME_SPECIES_RULES.temperate;
        const secondaryRules = BIOME_SPECIES_RULES[biome.secondaryName] || rules;
        const poolKey = type === 'tree' ? 'trees' : 'plants';
        let pool = [...(rules[poolKey] || []), ...(random() < biome.blend ? (secondaryRules[poolKey] || []) : [])];
        if (type === 'tree' && biome.name === 'temperate' && random() < 0.08) pool.push('pineRare');
        pool = this.filterSpeciesPool(pool, type);
        if (!pool.length && type !== 'tree') pool = this.filterSpeciesPool(['grassPatch', 'bush'], type);
        if (!pool.length) pool = this.filterSpeciesPool(['roundCanopy'], 'tree');
        const variety = this.getVarietyProfile();
        const limit = Math.min(pool.length, variety.limit);
        const commonPool = pool.slice(0, Math.max(1, limit));
        const rareAllowed = random() < variety.rare;
        const finalPool = rareAllowed ? pool : commonPool;
        const weightedIndex = Math.floor(Math.pow(random(), rareAllowed ? 0.72 : 1.28) * finalPool.length);
        return finalPool[clamp(weightedIndex, 0, finalPool.length - 1)];
    }

    filterSpeciesPool(pool, type) {
        const catalog = type === 'tree' ? TREE_SPECIES : PLANT_SPECIES;
        const alienEnabled = this.settings.vegetationAlienEnabled !== false;
        const deadEnabled = this.settings.vegetationDeadEnabled !== false;
        const fungiCrystalsEnabled = this.settings.vegetationFungiCrystalsEnabled !== false;
        const seen = new Set();
        return pool.filter((name) => {
            if (seen.has(name) || !catalog[name]) return false;
            seen.add(name);
            const def = catalog[name];
            if (!alienEnabled && (def.family === 'alien' || def.alien)) return false;
            if (!deadEnabled && (def.dead || def.burned || name === 'deadTree' || name === 'burntTrunk' || name === 'charredBush')) return false;
            if (!fungiCrystalsEnabled && /Mushroom|Crystal|crystal|fungus/i.test(name)) return false;
            return true;
        });
    }

    scaleForType(type, random, biome) {
        const rule = biome.rule || this.getVegetationRulesForBiome(biome.name);
        const scenicScale = 1 + (biome.scenic?.forest || 0) * 0.18 - (biome.scenic?.clearing || 0) * 0.12;
        const climateScale = mix(rule.scaleMin, rule.scaleMax, random()) * scenicScale;
        if (type === 'tree') {
            return climateScale;
        }
        return climateScale * mix(0.38, 0.68, random());
    }

    chunkIdForNormal(normal) {
        const lat = Math.floor((normal.y * 0.5 + 0.5) * 10);
        const lon = Math.floor((Math.atan2(normal.z, normal.x) / (Math.PI * 2) + 0.5) * 20);
        return `${clamp(lat, 0, 9)}:${clamp(lon, 0, 19)}`;
    }

    update(deltaTime, camera = this.camera) {
        if (!this.group || !this.settings.vegetationEnabled) return;
        this.elapsed += deltaTime || 0.016;
        this.rebuildTimer -= deltaTime || 0.016;
        const distance = camera ? camera.position.distanceTo(this.getPlanetCenter()) : 999;
        const limits = this.getLimits();
        const previousLod = this.lodState;
        if (distance > limits.renderDistance * 1.7) this.lodState = 'far';
        else if (distance > limits.renderDistance) this.lodState = 'medium';
        else this.lodState = 'near';

        this.patchPoints.visible = this.lodState !== 'near' || Boolean(this.settings.vegetationDebugBiomes);
        if (this.debugPoints) this.debugPoints.visible = Boolean(this.settings.vegetationDebugBiomes);
        if (this.debugClusterPoints) this.debugClusterPoints.visible = Boolean(this.settings.vegetationDebugClusters);
        Object.values(this.meshes).forEach((mesh) => {
            mesh.visible = this.lodState !== 'far';
        });

        const growthActive = Boolean(this.settings.vegetationGrowthEnabled);
        if (growthActive) {
            const speed = Number(this.settings.vegetationGrowthSpeed || 1) * 0.035;
            this.instances.forEach((instance) => {
                if (instance.state !== 'alive' || instance.growth >= instance.targetGrowth) return;
                const rule = this.getVegetationRulesForBiome(instance.biome);
                instance.growth = Math.min(instance.targetGrowth, instance.growth + speed * (rule.growthRate || 1) * (deltaTime || 0.016));
            });
        }

        if (this.settings.vegetationWindEnabled && this.lodState === 'near') {
            const wind = Number(this.settings.vegetationWindIntensity || 0.35);
            ['roundCrown', 'ovalCrown', 'wideCrown', 'denseCrown', 'pineCrown', 'palmCrown', 'glowCrown', 'strangeCrown'].forEach((key) => {
                if (this.meshes[key]) this.meshes[key].rotation.z = Math.sin(this.elapsed * 1.6 + key.length) * 0.006 * wind;
            });
            ['shrub', 'grassPatch', 'fern', 'flower', 'glowingBush', 'alienGrass'].forEach((key) => {
                if (this.meshes[key]) this.meshes[key].rotation.x = Math.cos(this.elapsed * 1.2 + key.length) * 0.004 * wind;
            });
        } else {
            Object.values(this.meshes).forEach((mesh) => mesh.rotation.set(0, 0, 0));
        }

        if (this.rebuildTimer <= 0 || previousLod !== this.lodState) {
            this.rebuildInstanceBuffers();
            this.rebuildTimer = this.lodState === 'near' ? 0.28 : 0.7;
        }
    }

    rebuildAllBuffers() {
        this.rebuildInstanceBuffers();
        this.rebuildPatchBuffers();
    }

    rebuildInstanceBuffers() {
        if (!this.group) return;
        const limits = this.getLimits();
        const counts = {};
        const cameraNormal = this.getCameraLocalNormal();
        const stride = this.lodState === 'near' ? 1 : Math.max(1, limits.stride);
        const debug = this.beginTreeDebugBuffer();
        Object.keys(this.meshes).forEach((key) => {
            counts[key] = 0;
            this.meshes[key].count = 0;
        });

        this.instances.forEach((instance, index) => {
            if (instance.state === 'removed') return;
            if (this.lodState === 'medium' && index % stride !== 0) return;
            if (this.lodState !== 'near' && instance.normal.dot(cameraNormal) < -0.08) return;
            if (instance.type === 'tree') {
                this.writeTreeInstance(instance, counts, debug);
            } else {
                this.writePlantInstance(instance, counts);
            }
        });

        Object.entries(this.meshes).forEach(([key, mesh]) => {
            mesh.count = counts[key] || 0;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        });
        this.endTreeDebugBuffer(debug);
    }

    nextMeshIndex(meshKey, counts) {
        const mesh = this.meshes[meshKey];
        if (!mesh) return -1;
        const index = counts[meshKey] || 0;
        if (index >= mesh.instanceMatrix.count) return -1;
        counts[meshKey] = index + 1;
        return index;
    }

    writeTreeInstance(instance, counts, debug = null) {
        const THREE = this.THREE;
        const transform = this.computeTreeTransform(instance);
        const species = TREE_SPECIES[instance.species] || TREE_SPECIES.roundCanopy;
        const trunkMesh = this.meshes[species.trunk] || this.meshes.trunk;
        if (!trunkMesh) return;
        const trunkIndex = this.nextMeshIndex(species.trunk || 'trunk', counts);
        if (trunkIndex < 0) return;
        const color = this.getTrunkColor(instance, species);
        this.tempMatrix.compose(
            transform.trunkWorldPosition,
            transform.quaternion,
            new THREE.Vector3(transform.trunkRadius, transform.trunkHeight, transform.trunkRadius)
        );
        trunkMesh.setMatrixAt(trunkIndex, this.tempMatrix);
        trunkMesh.setColorAt(trunkIndex, color);

        if (species.crown === 'cactusArm') {
            const armMesh = this.meshes.cactusArm;
            const armColor = this.getCrownColor(instance, species);
            const side = transform.trunkRadius * (2.1 + instance.random * 0.7);
            [
                { x: side, y: transform.trunkHeight * 0.56, h: transform.trunkHeight * 0.34 },
                { x: -side, y: transform.trunkHeight * 0.72, h: transform.trunkHeight * 0.28 }
            ].forEach((part) => {
                const armIndex = this.nextMeshIndex('cactusArm', counts);
                if (!armMesh || armIndex < 0) return;
                const local = new THREE.Vector3(part.x, part.y, 0).applyQuaternion(transform.quaternion).add(transform.basePosition);
                this.tempMatrix.compose(
                    local,
                    transform.quaternion,
                    new THREE.Vector3(transform.trunkRadius * 0.72, part.h, transform.trunkRadius * 0.72)
                );
                armMesh.setMatrixAt(armIndex, this.tempMatrix);
                armMesh.setColorAt(armIndex, armColor);
            });
        } else if (species.crown) {
            const crownMesh = this.meshes[species.crown];
            const crownIndex = this.nextMeshIndex(species.crown, counts);
            if (crownMesh && crownIndex >= 0 && transform.canopyRadius > 0.001) {
                this.tempMatrix.compose(
                    transform.canopyWorldPosition,
                    transform.crownQuaternion || transform.quaternion,
                    new THREE.Vector3(transform.canopyRadius, transform.canopyHeight, transform.canopyRadius)
                );
                crownMesh.setMatrixAt(crownIndex, this.tempMatrix);
                crownMesh.setColorAt(crownIndex, this.getCrownColor(instance, species));
            }
        }
        this.writeTreeDebug(transform, debug);
    }

    computeTreeTransform(instance) {
        const THREE = this.THREE;
        const normal = instance.normal;
        const growth = this.growthScale(instance);
        const treeScale = instance.scale;
        const species = TREE_SPECIES[instance.species] || TREE_SPECIES.roundCanopy;
        const speciesScale = mix(species.scale?.[0] || 0.8, species.scale?.[1] || 1.1, instance.random);
        const burnedScale = instance.state === 'burned' ? 0.72 : 1;
        const trunkHeight = Math.max(0.08, (species.trunkHeight || 1) * treeScale * speciesScale * growth * burnedScale);
        const trunkRadius = Math.max(0.018, 0.1 * treeScale * speciesScale * (0.82 + instance.random * 0.24) * (species.trunk === 'cactusColumn' ? 1.3 : 1));
        const canopyGrowth = instance.state === 'burned' || species.dead ? 0.28 : smoothstep(0.32, 1, growth);
        const canopyRadius = Math.max(0, (species.crownRadius || 0) * treeScale * speciesScale * (0.9 + instance.random * 0.22) * canopyGrowth);
        const canopyHeight = Math.max(0, (species.crownHeight || 0) * treeScale * speciesScale * (0.9 + instance.random * 0.2) * canopyGrowth);

        const basePosition = this.tempTreeBase
            .copy(normal)
            .multiplyScalar(this.getPlanetRadius() + instance.height + 0.035);

        this.tempSurfaceQuaternion.setFromUnitVectors(this.up, normal);
        this.tempYawQuaternion.setFromAxisAngle(normal, instance.spin);
        const quaternion = this.tempQuaternion.copy(this.tempYawQuaternion).multiply(this.tempSurfaceQuaternion);
        if (species.tilt) {
            const tiltAxis = new THREE.Vector3(Math.sin(instance.spin), 0, Math.cos(instance.spin)).normalize();
            const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(tiltAxis, species.tilt * (0.4 + instance.random * 0.8));
            quaternion.multiply(tiltQuaternion);
        }

        const trunkLocalPosition = this.tempLocalPosition.set(0, trunkHeight * 0.5, 0);
        const trunkWorldPosition = trunkLocalPosition.clone().applyQuaternion(quaternion).add(basePosition);

        const canopyLocalPosition = new THREE.Vector3(0, trunkHeight * (species.crownLift || 0.85) + canopyHeight * 0.42, 0);
        const canopyWorldPosition = canopyLocalPosition.clone().applyQuaternion(quaternion).add(basePosition);

        const topLocalPosition = new THREE.Vector3(0, trunkHeight, 0);
        const trunkTopWorldPosition = topLocalPosition.clone().applyQuaternion(quaternion).add(basePosition);
        const crownQuaternion = quaternion.clone();
        if (species.crown === 'flatCrown' || species.crown === 'palmCrown') {
            crownQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), instance.random * Math.PI));
        }

        return {
            basePosition: basePosition.clone(),
            normal,
            tangentRotation: instance.spin,
            scale: treeScale,
            growth,
            trunkHeight,
            trunkRadius,
            canopyRadius,
            canopyHeight,
            quaternion: quaternion.clone(),
            crownQuaternion,
            trunkWorldPosition,
            canopyWorldPosition,
            trunkTopWorldPosition
        };
    }

    getTrunkColor(instance, species) {
        const THREE = this.THREE;
        if (instance.state === 'burned' || species.burned) return new THREE.Color(0x302923);
        if (species.family === 'alien') return new THREE.Color(0x24302f).offsetHSL(0, 0, instance.random * 0.08);
        if (species.trunk === 'cactusColumn') return new THREE.Color(0x3f9f63).offsetHSL(0.02 * instance.random, 0.04, instance.random * 0.06 - 0.02);
        if (species.trunk === 'mushroomStem') return new THREE.Color(0xd7c1ef).offsetHSL(0.03 * instance.random, 0.08, instance.random * 0.08);
        if (species.trunk === 'crystalStem') return new THREE.Color(0x91e8ff).offsetHSL(0.08 * instance.random, 0.05, instance.random * 0.08);
        if (species.dead) return new THREE.Color(0x6c583a).offsetHSL(0, 0.03, instance.random * 0.08 - 0.03);
        return new THREE.Color(0x6f4b31).offsetHSL(0.02 * instance.random, 0.02, instance.random * 0.07 - 0.025);
    }

    getCrownColor(instance, species) {
        const THREE = this.THREE;
        if (instance.state === 'burned' || species.burned) return new THREE.Color(0x2c2924);
        if (species.dead) return new THREE.Color(0x725f3e).offsetHSL(0, 0.04, instance.random * 0.08 - 0.04);
        if (species.crown === 'snowyPineCrown') return new THREE.Color(0xd9eef2).lerp(instance.color, 0.18);
        if (species.crown === 'cactusArm') return new THREE.Color(0x3f9f63).offsetHSL(0.02 * instance.random, 0.04, instance.random * 0.06 - 0.02);
        if (species.crown === 'mushroomCap') return new THREE.Color(0xc58aff).offsetHSL(0.1 * instance.random, 0.08, instance.random * 0.12 - 0.02);
        if (species.crown === 'crystalShard') return new THREE.Color(0x8ad7ff).offsetHSL(0.12 * instance.random, 0.08, instance.random * 0.1);
        if (species.emissive) return new THREE.Color(0x56ffd0).lerp(instance.color, 0.35).offsetHSL(0.04 * instance.random, 0.08, 0.02);
        return instance.color.clone().offsetHSL(0.02 * instance.random, 0.05, instance.random * 0.12 - 0.03);
    }

    writePlantInstance(instance, counts) {
        const THREE = this.THREE;
        const species = PLANT_SPECIES[instance.species] || PLANT_SPECIES.bush;
        const mesh = this.meshes[species.mesh] || this.meshes.shrub;
        if (!mesh) return;
        const index = this.nextMeshIndex(species.mesh || 'shrub', counts);
        if (index < 0) return;
        const speciesScale = mix(species.scale?.[0] || 0.3, species.scale?.[1] || 0.6, instance.random);
        const baseScale = instance.scale * speciesScale * this.growthScale(instance);
        const color = this.getPlantColor(instance, species);
        const yScale = species.y || 0.72;
        this.composeSurfaceMatrix(instance, new THREE.Vector3(baseScale, baseScale * yScale, baseScale), baseScale * yScale * 0.5 + 0.025);
        mesh.setMatrixAt(index, this.tempMatrix);
        mesh.setColorAt(index, color);
    }

    getPlantColor(instance, species) {
        const THREE = this.THREE;
        if (instance.state === 'burned' || species.dead) return new THREE.Color(0x3b352e).offsetHSL(0, 0.02, instance.random * 0.06);
        if (species.mesh === 'flower') return new THREE.Color(0xffc857).offsetHSL(0.18 * instance.random, 0.1, instance.random * 0.1);
        if (species.mesh === 'smallMushroom') return new THREE.Color(0xd3a6ff).offsetHSL(0.1 * instance.random, 0.08, instance.random * 0.1);
        if (species.mesh === 'smallCrystal') return new THREE.Color(0x9de8ff).offsetHSL(0.14 * instance.random, 0.08, instance.random * 0.08);
        if (species.mesh === 'smallCactus') return new THREE.Color(0x3f9f63).offsetHSL(0.02 * instance.random, 0.04, instance.random * 0.06 - 0.02);
        if (species.alien) return new THREE.Color(0x58ffd2).lerp(instance.color, 0.35).offsetHSL(0.06 * instance.random, 0.08, 0.02);
        return instance.color.clone().offsetHSL(0.02 * instance.random, 0.05, instance.random * 0.12 - 0.03);
    }

    growthScale(instance) {
        if (!this.settings.vegetationGrowthEnabled) return 1;
        return clamp(instance.growth, 0.08, 1.1);
    }

    composeSurfaceMatrix(instance, scale, offset) {
        const THREE = this.THREE;
        const radius = this.getPlanetRadius();
        const normal = instance.normal;
        this.tempTreeBase.copy(normal).multiplyScalar(radius + instance.height + 0.025);
        this.tempSurfaceQuaternion.setFromUnitVectors(this.up, normal);
        this.tempYawQuaternion.setFromAxisAngle(normal, instance.spin);
        this.tempQuaternion.copy(this.tempYawQuaternion).multiply(this.tempSurfaceQuaternion);
        this.tempLocalPosition.set(0, offset, 0).applyQuaternion(this.tempQuaternion);
        this.tempPosition.copy(this.tempTreeBase).add(this.tempLocalPosition);
        this.tempScale.copy(scale);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    }

    beginTreeDebugBuffer() {
        if (!this.debugTreeLines) return null;
        const enabled = Boolean(this.settings.vegetationDebugBiomes);
        this.debugTreeLines.visible = enabled;
        if (!enabled) {
            this.debugTreeLines.geometry.setDrawRange(0, 0);
            return null;
        }
        return {
            positions: this.debugTreeLines.geometry.attributes.position.array,
            colors: this.debugTreeLines.geometry.attributes.color.array,
            cursor: 0,
            vertexLimit: this.debugTreeLineLimit * 4
        };
    }

    writeTreeDebug(transform, debug) {
        if (!debug || debug.cursor + 4 > debug.vertexLimit) return;
        this.writeDebugVertex(debug, transform.basePosition, 0.2, 1, 0.35);
        this.writeDebugVertex(debug, transform.trunkTopWorldPosition, 0.2, 1, 0.35);
        this.writeDebugVertex(debug, transform.trunkTopWorldPosition, 0.65, 0.9, 1);
        this.writeDebugVertex(debug, transform.canopyWorldPosition, 0.65, 0.9, 1);
    }

    writeDebugVertex(debug, position, r, g, b) {
        const idx = debug.cursor * 3;
        debug.positions[idx] = position.x;
        debug.positions[idx + 1] = position.y;
        debug.positions[idx + 2] = position.z;
        debug.colors[idx] = r;
        debug.colors[idx + 1] = g;
        debug.colors[idx + 2] = b;
        debug.cursor++;
    }

    endTreeDebugBuffer(debug) {
        if (!this.debugTreeLines) return;
        if (!debug) {
            this.debugTreeLines.geometry.setDrawRange(0, 0);
            return;
        }
        this.debugTreeLines.geometry.setDrawRange(0, debug.cursor);
        this.debugTreeLines.geometry.attributes.position.needsUpdate = true;
        this.debugTreeLines.geometry.attributes.color.needsUpdate = true;
    }

    rebuildPatchBuffers() {
        if (!this.patchPoints) return;
        const radius = this.getPlanetRadius();
        const position = this.patchPoints.geometry.attributes.position.array;
        const color = this.patchPoints.geometry.attributes.color.array;
        const debugPosition = this.debugPoints.geometry.attributes.position.array;
        const debugColor = this.debugPoints.geometry.attributes.color.array;
        let count = 0;
        this.patches.forEach((patch) => {
            if (patch.state === 'removed') return;
            const height = this.getPlanetSurfaceHeight(patch.normal);
            const point = patch.normal.clone().multiplyScalar(radius + height + 0.028);
            const patchColor = patch.state === 'burned' ? new this.THREE.Color(0x342d26) : patch.color;
            const idx = count * 3;
            position[idx] = point.x;
            position[idx + 1] = point.y;
            position[idx + 2] = point.z;
            color[idx] = patchColor.r;
            color[idx + 1] = patchColor.g;
            color[idx + 2] = patchColor.b;
            debugPosition[idx] = point.x;
            debugPosition[idx + 1] = point.y;
            debugPosition[idx + 2] = point.z;
            debugColor[idx] = patchColor.r;
            debugColor[idx + 1] = patchColor.g;
            debugColor[idx + 2] = patchColor.b;
            count++;
        });
        this.patchPoints.geometry.setDrawRange(0, count);
        this.debugPoints.geometry.setDrawRange(0, count);
        this.patchPoints.geometry.attributes.position.needsUpdate = true;
        this.patchPoints.geometry.attributes.color.needsUpdate = true;
        this.debugPoints.geometry.attributes.position.needsUpdate = true;
        this.debugPoints.geometry.attributes.color.needsUpdate = true;
    }

    getCameraLocalNormal() {
        if (!this.camera || !this.parentGroup) return new this.THREE.Vector3(0, 0, 1);
        this.cameraLocal.copy(this.camera.position);
        this.parentGroup.worldToLocal(this.cameraLocal);
        return this.cameraLocal.normalize();
    }

    applyDamage(worldPosition, radius, intensity = 1, type = 'burn') {
        if (!this.group || !worldPosition) return;
        const local = worldPosition.clone();
        this.parentGroup?.worldToLocal(local);
        if (local.lengthSq() <= 0.0001) return;
        const normal = local.normalize();
        const angularRadius = Math.max(0.01, radius / Math.max(1, this.getPlanetRadius()));
        const removeCore = type === 'meteor' || type === 'laser' ? 0.42 : 0.22;
        this.instances.forEach((instance) => {
            const angular = Math.acos(clamp(instance.normal.dot(normal), -1, 1));
            if (angular > angularRadius) return;
            const localT = angular / angularRadius;
            const influence = smoothstep(1, 0, localT) * intensity;
            if (localT < removeCore * intensity) instance.state = 'removed';
            else if (influence > 0.14) instance.state = 'burned';
            instance.growth = Math.min(instance.growth, 0.62);
        });
        this.patches.forEach((patch) => {
            const angular = Math.acos(clamp(patch.normal.dot(normal), -1, 1));
            if (angular > angularRadius) return;
            patch.state = angular / angularRadius < 0.42 ? 'removed' : 'burned';
        });
        this.rebuildAllBuffers();
    }

    regrow(worldPosition = null, radius = this.getPlanetRadius() * 0.8, intensity = 1) {
        if (!this.group) return;
        if (this.settings.vegetationRegrowthEnabled === false) return;
        let normal = null;
        if (worldPosition) {
            const local = worldPosition.clone();
            this.parentGroup?.worldToLocal(local);
            if (local.lengthSq() > 0.0001) normal = local.normalize();
        }
        const angularRadius = Math.max(0.01, radius / Math.max(1, this.getPlanetRadius()));
        this.instances.forEach((instance) => {
            if (normal) {
                const angular = Math.acos(clamp(instance.normal.dot(normal), -1, 1));
                if (angular > angularRadius) return;
            }
            if (instance.state !== 'alive') {
                const rule = this.getVegetationRulesForBiome(instance.biome);
                if ((rule.density || 0) < 0.1 && intensity < 0.85) return;
                instance.state = 'alive';
                instance.growth = this.settings.vegetationGrowthEnabled ? 0.12 * intensity * (rule.growthRate || 1) : 1;
            }
        });
        this.patches.forEach((patch) => {
            if (normal) {
                const angular = Math.acos(clamp(patch.normal.dot(normal), -1, 1));
                if (angular > angularRadius) return;
            }
            patch.state = 'alive';
        });
        this.rebuildAllBuffers();
    }

    updateSettings(settings = {}) {
        const previous = this.settings;
        this.settings = { ...this.settings, ...settings };
        if (!this.planetData) return;
        const needsRebuild = [
            'vegetationEnabled',
            'vegetationDensity',
            'vegetationQuality',
            'vegetationVarietyLevel',
            'vegetationAlienEnabled',
            'vegetationLowPlantsEnabled',
            'vegetationDeadEnabled',
            'vegetationFungiCrystalsEnabled',
            'vegetationBiomeVariety',
            'vegetationForestIntensity',
            'vegetationScenicEnabled',
            'vegetationScenicIntensity',
            'graphicsPreset'
        ].some((key) => previous[key] !== this.settings[key]);
        if (needsRebuild) this.generateForPlanet(this.planetData);
        if (this.debugPoints) this.debugPoints.visible = Boolean(this.settings.vegetationDebugBiomes);
        if (this.debugTreeLines) {
            this.debugTreeLines.visible = Boolean(this.settings.vegetationDebugBiomes);
            this.rebuildInstanceBuffers();
        }
        if (this.debugClusterPoints) this.debugClusterPoints.visible = Boolean(this.settings.vegetationDebugClusters);
    }

    getStats() {
        return {
            instances: this.instances.filter((item) => item.state !== 'removed').length,
            chunks: this.chunks.size
        };
    }

    reduceQualityStep() {
        const density = this.settings.vegetationDensity || 'medium';
        const nextDensity = density === 'cinematic' ? 'ultra' : density === 'ultra' ? 'high' : density === 'high' ? 'medium' : 'low';
        const nextQuality = this.settings.vegetationQuality === 'cinematic' ? 'high' : this.settings.vegetationQuality === 'high' ? 'medium' : 'low';
        const nextScenic = Math.max(0.35, Number(this.settings.vegetationScenicIntensity || 0.75) * 0.78);
        this.updateSettings({ vegetationDensity: nextDensity, vegetationQuality: nextQuality, vegetationWindEnabled: false, vegetationScenicIntensity: nextScenic });
        return { vegetationDensity: nextDensity, vegetationQuality: nextQuality, vegetationWindEnabled: false, vegetationScenicIntensity: nextScenic };
    }

    dispose() {
        if (this.group) {
            this.group.parent?.remove(this.group);
            disposeObject(this.group);
        }
        this.group = null;
        this.patchPoints = null;
        this.debugPoints = null;
        this.debugTreeLines = null;
        this.debugClusterPoints = null;
        this.meshes = {};
        this.instances = [];
        this.patches = [];
        this.scenicZones = [];
        this.chunks.clear();
    }
}
