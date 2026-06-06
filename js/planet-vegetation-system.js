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
    object.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (!child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
    });
}

const PRESET_LIMITS = {
    low: { trees: 90, plants: 170, patches: 220, stride: 3, renderDistance: 34, wind: false },
    medium: { trees: 170, plants: 320, patches: 360, stride: 2, renderDistance: 48, wind: true },
    high: { trees: 270, plants: 520, patches: 520, stride: 1, renderDistance: 62, wind: true },
    cinematic: { trees: 380, plants: 760, patches: 700, stride: 1, renderDistance: 78, wind: true }
};

const DENSITY_SCALE = {
    low: 0.55,
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
        const trunkGeometry = new THREE.CylinderGeometry(0.055, 0.075, 1, 5, 1);
        const crownGeometry = new THREE.ConeGeometry(0.42, 0.95, 7, 1);
        const shrubGeometry = new THREE.DodecahedronGeometry(0.34, 0);
        const mushroomGeometry = new THREE.CylinderGeometry(0.18, 0.08, 0.42, 7, 1);

        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6a4a2f, roughness: 0.88, metalness: 0.02 });
        const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x2f9b48, roughness: 0.82, metalness: 0.01 });
        const shrubMaterial = new THREE.MeshStandardMaterial({ color: 0x50b85b, roughness: 0.86, metalness: 0.0 });
        const mushroomMaterial = new THREE.MeshStandardMaterial({ color: 0xdcc4ff, roughness: 0.74, metalness: 0.02, emissive: 0x1d0f2a, emissiveIntensity: 0.12 });

        this.meshes.trunk = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, limits.trees);
        this.meshes.crown = new THREE.InstancedMesh(crownGeometry, crownMaterial, limits.trees);
        this.meshes.shrub = new THREE.InstancedMesh(shrubGeometry, shrubMaterial, limits.plants);
        this.meshes.mushroom = new THREE.InstancedMesh(mushroomGeometry, mushroomMaterial, Math.floor(limits.plants * 0.34));

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
        const renderDistance = Number(this.settings.vegetationRenderDistance || preset.renderDistance);
        return {
            trees: Math.max(12, Math.floor(preset.trees * density)),
            plants: Math.max(24, Math.floor(preset.plants * density)),
            patches: Math.max(64, Math.floor(preset.patches * density)),
            stride: preset.stride,
            renderDistance,
            wind: preset.wind
        };
    }

    generateVegetationInstances() {
        const THREE = this.THREE;
        const seed = this.planetData.seed || 1;
        const random = createSeededRandom(seed + 7301);
        const radius = this.getPlanetRadius();
        const limits = this.getLimits();
        const desired = limits.trees + limits.plants;
        const maxAttempts = desired * 7;
        let accepted = 0;
        let treeCount = 0;
        let plantCount = 0;

        for (let i = 0; i < maxAttempts && accepted < desired; i++) {
            const normal = this.fibonacciNormal(i + Math.floor(random() * 97), maxAttempts, random);
            const biome = this.evaluateBiome(normal);
            if (biome.density <= 0.035 || random() > biome.density) continue;
            const type = this.pickVegetationType(biome, random);
            if (type === 'tree' && treeCount >= limits.trees) continue;
            if (type !== 'tree' && plantCount >= limits.plants) continue;
            const height = this.getPlanetSurfaceHeight(normal);
            const chunkId = this.chunkIdForNormal(normal);
            const instance = {
                normal: normal.clone(),
                height,
                chunkId,
                type,
                biome: biome.name,
                color: biome.color.clone(),
                random: random(),
                spin: random() * Math.PI * 2,
                scale: this.scaleForType(type, random, biome),
                growth: this.settings.vegetationGrowthEnabled ? random() * 0.22 : 1,
                targetGrowth: 0.86 + random() * 0.22,
                state: biome.rule.burned ? 'burned' : 'alive',
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
        const mushroomChance = clamp(rule.mushroomChance * (biome.name === 'swamp' ? 1.18 : 1), 0, 0.82);
        const roll = random();
        if (roll < mushroomChance) return 'mushroom';
        if (roll < mushroomChance + clamp(rule.treeChance + scenicTreeBoost - openPenalty, 0.02, 0.86)) return 'tree';
        return 'shrub';
    }

    scaleForType(type, random, biome) {
        const rule = biome.rule || this.getVegetationRulesForBiome(biome.name);
        const scenicScale = 1 + (biome.scenic?.forest || 0) * 0.18 - (biome.scenic?.clearing || 0) * 0.12;
        const climateScale = mix(rule.scaleMin, rule.scaleMax, random()) * scenicScale;
        if (type === 'tree') {
            return climateScale;
        }
        if (type === 'mushroom') return climateScale * (biome.name === 'fungus' || biome.name === 'alien' ? 0.78 : 0.52);
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
            this.meshes.crown.rotation.z = Math.sin(this.elapsed * 1.6) * 0.006 * wind;
            this.meshes.shrub.rotation.x = Math.cos(this.elapsed * 1.2) * 0.004 * wind;
        } else {
            this.meshes.crown.rotation.set(0, 0, 0);
            this.meshes.shrub.rotation.set(0, 0, 0);
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
        const counts = { tree: 0, shrub: 0, mushroom: 0 };
        const cameraNormal = this.getCameraLocalNormal();
        const stride = this.lodState === 'near' ? 1 : Math.max(1, limits.stride);
        const debug = this.beginTreeDebugBuffer();
        this.meshes.trunk.count = 0;
        this.meshes.crown.count = 0;
        this.meshes.shrub.count = 0;
        this.meshes.mushroom.count = 0;

        this.instances.forEach((instance, index) => {
            if (instance.state === 'removed') return;
            if (this.lodState === 'medium' && index % stride !== 0) return;
            if (this.lodState !== 'near' && instance.normal.dot(cameraNormal) < -0.08) return;
            if (instance.type === 'tree') {
                if (counts.tree >= this.meshes.trunk.instanceMatrix.count) return;
                this.writeTreeInstance(instance, counts.tree++, debug);
            } else if (instance.type === 'mushroom') {
                if (counts.mushroom >= this.meshes.mushroom.instanceMatrix.count) return;
                this.writePlantInstance(instance, this.meshes.mushroom, counts.mushroom++);
            } else {
                if (counts.shrub >= this.meshes.shrub.instanceMatrix.count) return;
                this.writePlantInstance(instance, this.meshes.shrub, counts.shrub++);
            }
        });

        this.meshes.trunk.count = counts.tree;
        this.meshes.crown.count = counts.tree;
        this.meshes.shrub.count = counts.shrub;
        this.meshes.mushroom.count = counts.mushroom;
        Object.values(this.meshes).forEach((mesh) => {
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        });
        this.endTreeDebugBuffer(debug);
    }

    writeTreeInstance(instance, index, debug = null) {
        const THREE = this.THREE;
        const transform = this.computeTreeTransform(instance);
        const color = instance.state === 'burned' ? new THREE.Color(0x3c332d) : new THREE.Color(0x6f4b31);
        this.tempMatrix.compose(
            transform.trunkWorldPosition,
            transform.quaternion,
            new THREE.Vector3(transform.trunkRadius, transform.trunkHeight, transform.trunkRadius)
        );
        this.meshes.trunk.setMatrixAt(index, this.tempMatrix);
        this.meshes.trunk.setColorAt(index, color);

        const crownColor = instance.state === 'burned' ? new THREE.Color(0x2c2924) : instance.color.clone().offsetHSL(0, 0.04, instance.random * 0.08 - 0.02);
        this.tempMatrix.compose(
            transform.canopyWorldPosition,
            transform.quaternion,
            new THREE.Vector3(transform.canopyRadius, transform.canopyHeight, transform.canopyRadius)
        );
        this.meshes.crown.setMatrixAt(index, this.tempMatrix);
        this.meshes.crown.setColorAt(index, crownColor);
        this.writeTreeDebug(transform, debug);
    }

    computeTreeTransform(instance) {
        const THREE = this.THREE;
        const normal = instance.normal;
        const growth = this.growthScale(instance);
        const treeScale = instance.scale;
        const burnedScale = instance.state === 'burned' ? 0.72 : 1;
        const trunkHeight = Math.max(0.08, 1.22 * treeScale * growth * burnedScale);
        const trunkRadius = Math.max(0.018, 0.12 * treeScale * (0.82 + instance.random * 0.24));
        const canopyGrowth = instance.state === 'burned' ? 0.18 : smoothstep(0.32, 1, growth);
        const canopyRadius = Math.max(0.035, 0.58 * treeScale * (0.9 + instance.random * 0.22) * canopyGrowth);
        const canopyHeight = Math.max(0.04, 0.84 * treeScale * (0.9 + instance.random * 0.2) * canopyGrowth);

        const basePosition = this.tempTreeBase
            .copy(normal)
            .multiplyScalar(this.getPlanetRadius() + instance.height + 0.035);

        this.tempSurfaceQuaternion.setFromUnitVectors(this.up, normal);
        this.tempYawQuaternion.setFromAxisAngle(normal, instance.spin);
        const quaternion = this.tempQuaternion.copy(this.tempYawQuaternion).multiply(this.tempSurfaceQuaternion);

        const trunkLocalPosition = this.tempLocalPosition.set(0, trunkHeight * 0.5, 0);
        const trunkWorldPosition = trunkLocalPosition.clone().applyQuaternion(quaternion).add(basePosition);

        const canopyLocalPosition = new THREE.Vector3(0, trunkHeight + canopyHeight * 0.42, 0);
        const canopyWorldPosition = canopyLocalPosition.clone().applyQuaternion(quaternion).add(basePosition);

        const topLocalPosition = new THREE.Vector3(0, trunkHeight, 0);
        const trunkTopWorldPosition = topLocalPosition.clone().applyQuaternion(quaternion).add(basePosition);

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
            trunkWorldPosition,
            canopyWorldPosition,
            trunkTopWorldPosition
        };
    }

    writePlantInstance(instance, mesh, index) {
        const THREE = this.THREE;
        const baseScale = instance.scale * this.growthScale(instance);
        const color = instance.state === 'burned' ? new THREE.Color(0x3b352e) : instance.color.clone().offsetHSL(0.02 * instance.random, 0.05, instance.random * 0.12 - 0.03);
        const yScale = instance.type === 'mushroom' ? 1.2 : 0.72;
        this.composeSurfaceMatrix(instance, new THREE.Vector3(baseScale, baseScale * yScale, baseScale), baseScale * yScale * 0.5 + 0.025);
        mesh.setMatrixAt(index, this.tempMatrix);
        mesh.setColorAt(index, color);
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
            'vegetationAlienEnabled',
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
