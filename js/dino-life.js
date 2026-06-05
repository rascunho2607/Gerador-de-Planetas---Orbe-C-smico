const DIRECTIONS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
const DIRECTION_ANGLES = { E: 0, NE: 45, N: 90, NW: 135, W: 180, SW: 225, S: 270, SE: 315 };
const DEFAULT_SPECIES = ['Blue Raptor', 'T-Rex', 'Triceratops'];

function anim(folder, fps = 8) {
    return { folder, prefix: folder, fps, start: 1, end: 29, step: 2, pad: 3, extension: 'png' };
}

function raptorAnim(name, fps = 8) {
    return anim(`Raptor ${name}`, fps);
}

const DINO_MANIFEST = {
    'Blue Raptor': { kind: 'predator', animations: { idle: raptorAnim('Idle', 7), walk: raptorAnim('Walk', 10), run: raptorAnim('run', 13), taunt: raptorAnim('Shout', 8) } },
    'Green Raptor': { kind: 'predator', animations: { idle: raptorAnim('Idle', 7), walk: raptorAnim('Walk', 10), run: raptorAnim('run', 13), taunt: raptorAnim('Shout', 8) } },
    'Red Raptor': { kind: 'predator', animations: { idle: raptorAnim('Idle', 7), walk: raptorAnim('Walk', 10), run: raptorAnim('run', 13), taunt: raptorAnim('Shout', 8) } },
    'Velociraptor': { kind: 'predator', animations: { idle: anim('Idle', 7), walk: anim('Walk', 10), run: anim('Run', 13), taunt: anim('Taunt', 8) } },
    'T-Rex': { kind: 'predator', animations: { idle: anim('Idle', 7), walk: anim('Walk', 9), run: anim('Run', 11), taunt: anim('Taunt', 8) } },
    'Triceratops': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 9), run: anim('Run', 10), taunt: anim('Taunt', 8) } },
    'Stegosaurus': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 8), run: anim('Run', 9), taunt: anim('Taunt', 8) } },
    'Gallimimus': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 10), run: anim('Run', 13), taunt: anim('Taunt', 8) } },
    'Parasaurolophus': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 8), run: anim('Run', 10), taunt: anim('Taunt', 8) } },
    'Dilophosaurus': { kind: 'predator', animations: { idle: anim('Idle', 7), walk: anim('Walk', 9), run: anim('Run', 11), taunt: anim('Taunt', 8) } },
    'Crocodile': { kind: 'reptile', animations: { idle: anim('Idle', 7), walk: anim('Walk', 8), run: anim('Run', 10), taunt: anim('Taunt', 8) } },
    'ELITE T-Rex': { kind: 'predator', animations: { idle: anim('Idle', 7), walk: anim('Walk', 9), run: anim('Run', 11), taunt: anim('Taunt', 8) } },
    'ELITE Triceratops': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 8), run: anim('Run', 10), taunt: anim('Taunt', 8) } },
    'ELITE Stegosaurus': { kind: 'herbivore', animations: { idle: anim('Idle', 7), walk: anim('Walk', 8), run: anim('Run', 9), taunt: anim('Taunt', 8) } },
    'ELITE Brachiosaurus': { kind: 'herbivore', animations: { idle: anim('Idle', 6), walk: anim('Walk', 7), run: anim('Walk', 7), taunt: anim('Taunt', 7) } }
};

function makeRandom(seed) {
    let state = Number(seed) >>> 0;
    return function random() {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomRange(random, min, max) {
    return min + random() * (max - min);
}

function randomUnitVector(THREE, random) {
    const z = randomRange(random, -0.88, 0.88);
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - z * z);
    return new THREE.Vector3(Math.cos(angle) * radius, z, Math.sin(angle) * radius).normalize();
}

function tangentFromNormal(THREE, normal, random) {
    const helper = Math.abs(normal.y) > 0.86 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(helper, normal).normalize();
    tangent.applyAxisAngle(normal, random() * Math.PI * 2).normalize();
    return tangent;
}

function frameList(config, direction) {
    const angle = DIRECTION_ANGLES[direction] ?? 0;
    const files = [];
    for (let frame = config.start; frame <= config.end; frame += config.step) {
        files.push(`${config.prefix}_${angle}_${String(frame).padStart(config.pad, '0')}.${config.extension}`);
    }
    return files;
}

class SpriteAnimationController {
    constructor(system, species, material) {
        this.system = system;
        this.species = species;
        this.material = material;
        this.animation = 'idle';
        this.direction = 'S';
        this.frameIndex = 0;
        this.frameTimer = 0;
        this.fps = 8;
        this.frames = [];
        this.setAnimation('idle', 'S');
    }

    setAnimation(animation, direction = this.direction) {
        const resolved = this.system.resolveAnimation(this.species, animation);
        this.animation = resolved.animation;
        this.direction = this.system.resolveDirection(this.species, resolved.animation, direction);
        this.frames = this.system.getFrames(this.species, this.animation, this.direction);
        this.fps = resolved.config.fps || 8;
        this.frameIndex = Math.min(this.frameIndex, Math.max(0, this.frames.length - 1));
        this.applyFrame();
    }

    update(deltaTime, direction) {
        if (direction !== this.direction) this.setAnimation(this.animation, direction);
        if (!this.frames.length) return;
        this.frameTimer += deltaTime;
        const frameDuration = 1 / this.fps;
        if (this.frameTimer < frameDuration) return;
        this.frameTimer %= frameDuration;
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        this.applyFrame();
    }

    applyFrame() {
        if (!this.frames.length) return;
        const texture = this.system.loadTexture(this.frames[this.frameIndex]);
        if (texture) this.material.map = texture;
        this.material.needsUpdate = true;
    }
}

export class DinoLifeSystem {
    constructor(options) {
        this.THREE = options.THREE;
        this.camera = options.camera;
        this.parentGroup = options.parentGroup || options.scene;
        this.getPlanetRadius = options.getPlanetRadius || (() => 1);
        this.getPlanetCenter = options.getPlanetCenter || (() => new this.THREE.Vector3());
        this.getPlanetMesh = options.getPlanetMesh || (() => null);
        this.getPlanetSurfaceHeight = options.getPlanetSurfaceHeight || (() => 0);
        this.spriteBasePath = options.spriteBasePath || './sprites/';
        this.settings = options.settings || {};
        this.textureLoader = new this.THREE.TextureLoader();
        this.textureCache = new Map();
        this.warned = new Set();
        this.group = new this.THREE.Group();
        this.group.name = 'DinoLifeSystem';
        this.parentGroup.add(this.group);
        this.population = [];
        this.planetInfo = { radius: 1, seed: 1, profile: null, planetMesh: null };
        this.tmpCameraDir = new this.THREE.Vector3();
        this.tmpCenter = new this.THREE.Vector3();
        this.tmpWorldCenter = new this.THREE.Vector3();
        this.tmpWorldPosition = new this.THREE.Vector3();
        this.tmpWorldNormal = new this.THREE.Vector3();
        this.tmpLocalCamera = new this.THREE.Vector3();
        this.surfaceUp = new this.THREE.Vector3(0, 1, 0);
        this.maxActive = 80;
    }

    setPlanetInfo(info) {
        this.planetInfo = { ...this.planetInfo, ...info };
    }

    updateSettings(settings) {
        this.settings = settings || this.settings;
    }

    clearPopulation() {
        this.population.length = 0;
        while (this.group.children.length) {
            const child = this.group.children[0];
            this.group.remove(child);
            child.traverse((node) => {
                if (node.geometry) node.geometry.dispose();
                if (node.material) node.material.dispose();
            });
        }
    }

    regeneratePopulation() {
        this.clearPopulation();
        if (!this.shouldRunForPlanet()) return;
        const random = makeRandom((this.planetInfo.seed || 1) + 70177);
        const speciesList = this.getSelectedSpecies();
        const count = Math.min(120, Math.max(0, Math.floor(this.settings.dinoCount || 0)));
        for (let i = 0; i < count; i++) {
            const species = speciesList[Math.floor(random() * speciesList.length)] || DEFAULT_SPECIES[0];
            if (!DINO_MANIFEST[species]) continue;
            this.population.push(this.createDino(species, random, i));
        }
    }

    shouldRunForPlanet() {
        if (!this.settings.lifeEnabled) return false;
        const profileType = this.planetInfo.profile?.type;
        return !['star', 'blackhole', 'gas'].includes(profileType);
    }

    getSelectedSpecies() {
        const selected = Array.isArray(this.settings.dinoSpecies) ? this.settings.dinoSpecies : DEFAULT_SPECIES;
        const available = selected.filter((name) => DINO_MANIFEST[name]);
        return available.length ? available : DEFAULT_SPECIES;
    }

    createDino(species, random, index) {
        const THREE = this.THREE;
        const normal = randomUnitVector(THREE, random);
        const tangent = tangentFromNormal(THREE, normal, random);
        const scale = this.getSpeciesScale(species) * (this.settings.dinoScale || 1);
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            alphaTest: 0.08,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale * 0.8, scale), material);
        mesh.frustumCulled = false;
        const group = new THREE.Group();
        group.add(mesh);
        group.visible = false;
        this.group.add(group);

        const speedScale = Math.max(1, this.getRadius());
        const dino = {
            index,
            species,
            kind: DINO_MANIFEST[species].kind,
            normal,
            tangent,
            mesh,
            group,
            material,
            animation: new SpriteAnimationController(this, species, material),
            state: random() > 0.72 ? 'idle' : 'walk',
            stateTimer: randomRange(random, 1.0, 6.0),
            turnTimer: randomRange(random, 0.8, 4.5),
            speed: randomRange(random, 0.006, 0.018) * speedScale * (this.settings.dinoMoveSpeed || 1) * (DINO_MANIFEST[species].kind === 'predator' ? 1.25 : 0.82),
            random
        };
        this.placeDino(dino);
        return dino;
    }

    getSpeciesScale(species) {
        if (species.includes('Brachiosaurus')) return 0.65;
        if (species.includes('T-Rex')) return 0.48;
        if (species.includes('Triceratops') || species.includes('Stegosaurus')) return 0.38;
        if (species.includes('Crocodile')) return 0.24;
        return 0.3;
    }

    placeDino(dino) {
        const THREE = this.THREE;
        const center = this.getCenter();
        const radius = this.getRadius();
        const scale = this.getSpeciesScale(dino.species) * (this.settings.dinoScale || 1);
        const up = dino.normal;
        const surfaceHeight = this.getSurfaceHeight(up);
        const groundOffset = this.getGroundOffset(scale, radius);
        const pos = new THREE.Vector3().copy(center).addScaledVector(up, radius + surfaceHeight + groundOffset);
        dino.group.position.copy(pos);
        dino.group.quaternion.setFromUnitVectors(this.surfaceUp, up);

        dino.mesh.position.set(0, scale * 0.5, 0);
        this.updateBillboard(dino);
    }

    getCenter() {
        const center = this.getPlanetCenter();
        if (center?.isVector3) return center;
        return this.tmpCenter.set(0, 0, 0);
    }

    getRadius() {
        return Math.max(0.5, this.planetInfo.radius || this.getPlanetRadius() || 1);
    }

    getSurfaceHeight(normal) {
        const sampled = this.getPlanetSurfaceHeight(normal, this.planetInfo) || 0;
        return Number.isFinite(sampled) ? sampled : 0;
    }

    getGroundOffset(scale, radius) {
        return Math.max(0.02, Math.min(0.08, radius * 0.006, scale * 0.14));
    }

    getWorldCenter() {
        this.tmpWorldCenter.copy(this.getCenter());
        if (this.group.parent) {
            this.group.parent.updateWorldMatrix(true, false);
            this.group.parent.localToWorld(this.tmpWorldCenter);
        }
        return this.tmpWorldCenter;
    }

    getWorldNormal(dino) {
        this.tmpWorldNormal.copy(dino.normal);
        if (this.group.parent) {
            this.group.parent.updateWorldMatrix(true, false);
            this.tmpWorldNormal.transformDirection(this.group.parent.matrixWorld);
        }
        return this.tmpWorldNormal.normalize();
    }

    updateBillboard(dino) {
        dino.group.updateWorldMatrix(true, false);
        this.tmpLocalCamera.copy(this.camera.position);
        dino.group.worldToLocal(this.tmpLocalCamera);
        this.tmpLocalCamera.y = 0;
        if (this.tmpLocalCamera.lengthSq() < 0.000001) return;
        this.tmpLocalCamera.normalize();
        dino.mesh.rotation.set(0, Math.atan2(this.tmpLocalCamera.x, this.tmpLocalCamera.z), 0);
    }

    update(deltaTime) {
        if (!this.shouldRunForPlanet()) {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;
        const center = this.getWorldCenter();
        const radius = this.getRadius();
        const cameraDistanceFromCenter = this.camera.position.distanceTo(center);
        const renderDistance = this.settings.dinoRenderDistance || radius * 5.5;
        const animateDistance = this.settings.dinoAnimateDistance || radius * 3.5;
        const globalCullDistance = Math.max(radius * 2.6, renderDistance);
        if (cameraDistanceFromCenter > globalCullDistance + radius) {
            this.population.forEach((dino) => dino.group.visible = false);
            return;
        }

        this.tmpCameraDir.copy(this.camera.position).sub(center).normalize();
        let active = 0;
        for (const dino of this.population) {
            const visibleSide = this.getWorldNormal(dino).dot(this.tmpCameraDir) > -0.08;
            dino.group.getWorldPosition(this.tmpWorldPosition);
            const distance = this.tmpWorldPosition.distanceTo(this.camera.position);
            const visible = visibleSide && distance < renderDistance && active < this.maxActive;
            dino.group.visible = visible;
            if (!visible) continue;
            active++;

            const animate = distance < animateDistance;
            this.updateBehavior(dino, deltaTime, animate);
            this.moveDino(dino, deltaTime);
            this.placeDino(dino);
            if (animate) dino.animation.update(deltaTime, this.getSpriteDirection(dino));
        }
    }

    updateBehavior(dino, deltaTime, animate) {
        dino.stateTimer -= deltaTime;
        dino.turnTimer -= deltaTime;
        if (dino.turnTimer <= 0) {
            dino.tangent.applyAxisAngle(dino.normal, randomRange(dino.random, -0.85, 0.85)).normalize();
            dino.turnTimer = randomRange(dino.random, 1.0, 5.5);
        }
        if (dino.stateTimer <= 0) {
            const roll = dino.random();
            dino.state = roll > 0.78 ? 'idle' : roll > 0.62 && dino.kind === 'predator' ? 'run' : 'walk';
            dino.stateTimer = randomRange(dino.random, 1.4, 6.0);
            const animName = dino.state === 'run' ? 'run' : dino.state === 'walk' ? 'walk' : 'idle';
            dino.animation.setAnimation(animName, this.getSpriteDirection(dino));
        }
        if (!animate && dino.state !== 'walk') {
            dino.state = 'walk';
            dino.animation.setAnimation('walk', this.getSpriteDirection(dino));
        }
    }

    moveDino(dino, deltaTime) {
        if (dino.state === 'idle') return;
        const speedMul = dino.state === 'run' ? 2.0 : 1.0;
        const radius = this.getRadius();
        const angularStep = (dino.speed * speedMul * deltaTime) / Math.max(0.5, radius);
        dino.normal.addScaledVector(dino.tangent, angularStep).normalize();
        dino.tangent.addScaledVector(dino.normal, -dino.tangent.dot(dino.normal)).normalize();
    }

    getSpriteDirection(dino) {
        dino.group.getWorldPosition(this.tmpWorldPosition);
        const normal = this.getWorldNormal(dino).clone();
        const toCamera = this.camera.position.clone().sub(this.tmpWorldPosition).normalize();
        const right = new this.THREE.Vector3().crossVectors(normal, toCamera);
        if (right.lengthSq() < 0.000001) return dino.animation.direction || 'S';
        right.normalize();
        const forward = new this.THREE.Vector3().crossVectors(right, normal).normalize();
        const tangent = dino.tangent.clone();
        if (this.group.parent) tangent.transformDirection(this.group.parent.matrixWorld);
        const x = tangent.dot(right);
        const y = tangent.dot(forward);
        const angle = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        const index = Math.round(angle / 45) % 8;
        return DIRECTIONS[index];
    }

    resolveAnimation(species, animation) {
        const manifest = DINO_MANIFEST[species];
        const candidate = manifest.animations[animation] ? animation : manifest.animations.walk ? 'walk' : 'idle';
        return { animation: candidate, config: manifest.animations[candidate] };
    }

    resolveDirection(species, animation, direction) {
        if (DIRECTIONS.includes(direction)) return direction;
        return 'S';
    }

    getFrames(species, animation, direction) {
        const config = DINO_MANIFEST[species].animations[animation];
        const files = frameList(config, direction);
        return files.map((file) => encodeURI(`${this.spriteBasePath}${species}/${config.folder}/${direction}/${file}`));
    }

    loadTexture(url) {
        if (this.textureCache.has(url)) return this.textureCache.get(url);
        const texture = this.textureLoader.load(
            url,
            (loaded) => {
                loaded.minFilter = this.THREE.LinearFilter;
                loaded.magFilter = this.THREE.NearestFilter;
                loaded.generateMipmaps = false;
                loaded.needsUpdate = true;
            },
            undefined,
            () => {
                if (!this.warned.has(url)) {
                    console.warn(`Sprite nao encontrada: ${url}`);
                    this.warned.add(url);
                }
            }
        );
        texture.minFilter = this.THREE.LinearFilter;
        texture.magFilter = this.THREE.NearestFilter;
        this.textureCache.set(url, texture);
        return texture;
    }

    dispose() {
        this.clearPopulation();
        this.textureCache.forEach((texture) => texture.dispose());
        this.textureCache.clear();
        if (this.group.parent) this.group.parent.remove(this.group);
    }
}

export { DINO_MANIFEST };
