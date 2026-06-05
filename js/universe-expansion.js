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

function pick(random, values) {
    return values[Math.floor(random() * values.length)];
}

function disposeNode(node) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    node.traverse((child) => {
        if (child.geometry) geometries.add(child.geometry);
        if (!child.material) return;
        const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
        childMaterials.forEach((material) => {
            materials.add(material);
            ['map', 'alphaMap', 'emissiveMap'].forEach((key) => {
                if (material[key]) textures.add(material[key]);
            });
        });
    });
    geometries.forEach((geometry) => geometry.dispose());
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
}

export class UniverseExpansion {
    constructor({ THREE, parentGroup, camera, planetRadius = 10 }) {
        this.THREE = THREE;
        this.parentGroup = parentGroup;
        this.camera = camera;
        this.planetRadius = planetRadius;
        this.group = new THREE.Group();
        this.group.name = 'UniverseExpansion';
        this.animatables = [];
        this.comets = [];
        this.nebulas = [];
        this.blackHoles = [];
        this.tempVector = new THREE.Vector3();
        this.tempVector2 = new THREE.Vector3();
        this.tempVector3 = new THREE.Vector3();
        this.cameraRight = new THREE.Vector3();
        this.parentGroup.add(this.group);
    }

    rebuild(seed, settings = {}) {
        this.dispose();
        this.parentGroup.add(this.group);
        this.seed = seed;
        this.settings = { ...settings };
        const random = makeRandom(seed + 318811);

        if (settings.cosmicNebulasEnabled) this.createAnimatedNebulas(random, seed);
        if (settings.cosmicPlanetsEnabled) this.createProceduralSolarSystem(random, seed);
        if (settings.cosmicBlackHolesEnabled) this.createBlackHoles(random, seed);
        if (settings.cosmicCometsEnabled) this.createComets(random, settings.cosmicCometCount || 0);
        if (settings.cosmicStationsEnabled) this.createStations(random, settings.cosmicStationCount || 0);
    }

    update(deltaTime, elapsedTime) {
        const timeScale = Math.min(0.06, deltaTime || 0.016) * 60;
        this.animatables.forEach((item) => item.update(timeScale, elapsedTime || 0));
        this.comets.forEach((comet) => this.updateComet(comet, timeScale, elapsedTime || 0));
        this.nebulas.forEach((nebula) => {
            nebula.sprite.material.rotation += nebula.rotationSpeed * timeScale;
            nebula.sprite.material.opacity = nebula.baseOpacity + Math.sin((elapsedTime || 0) * nebula.pulseSpeed + nebula.phase) * nebula.pulseAmount;
        });
    }

    dispose() {
        this.animatables.length = 0;
        this.comets.length = 0;
        this.nebulas.length = 0;
        this.blackHoles.length = 0;
        while (this.group.children.length) {
            const child = this.group.children[0];
            this.group.remove(child);
            disposeNode(child);
        }
        if (this.group.parent) this.group.parent.remove(this.group);
    }

    collectLensData(maxCount = 2) {
        const lenses = [];
        this.camera.updateMatrixWorld();
        this.cameraRight.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
        for (const blackHole of this.blackHoles) {
            const center = this.tempVector;
            blackHole.group.getWorldPosition(center);
            const projected = this.tempVector2.copy(center).project(this.camera);
            if (projected.z < -1 || projected.z > 1) continue;
            const edge = this.tempVector3.copy(center).addScaledVector(this.cameraRight, blackHole.lensRadius);
            const edgeProjected = edge.project(this.camera);
            const radius = Math.min(0.28, Math.max(0.055, Math.abs(edgeProjected.x - projected.x) * 0.72));
            lenses.push({
                x: projected.x * 0.5 + 0.5,
                y: projected.y * 0.5 + 0.5,
                radius,
                strength: blackHole.strength
            });
            if (lenses.length >= maxCount) break;
        }
        return lenses;
    }

    createGlowTexture(inner, outer, size = 512) {
        const { THREE } = this;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, inner);
        gradient.addColorStop(0.34, inner);
        gradient.addColorStop(1, outer);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    createNebulaTexture(random, hueA, hueB) {
        const { THREE } = this;
        const size = 768;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size, size);

        for (let i = 0; i < 42; i++) {
            const x = randomRange(random, size * 0.18, size * 0.82);
            const y = randomRange(random, size * 0.16, size * 0.84);
            const radius = randomRange(random, size * 0.09, size * 0.26);
            const hue = i % 2 ? hueA : hueB;
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `hsla(${hue}, 90%, 68%, ${randomRange(random, 0.08, 0.19)})`);
            gradient.addColorStop(0.45, `hsla(${hue}, 86%, 54%, ${randomRange(random, 0.03, 0.08)})`);
            gradient.addColorStop(1, `hsla(${hue}, 90%, 38%, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    createSprite(texture, position, scale, opacity, color = 0xffffff) {
        const { THREE } = this;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: texture,
            color,
            transparent: true,
            opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        }));
        sprite.position.copy(position);
        sprite.scale.set(scale, scale, 1);
        this.group.add(sprite);
        return sprite;
    }

    createAnimatedNebulas(random, seed) {
        const radius = this.planetRadius;
        const count = 3;
        for (let i = 0; i < count; i++) {
            const texture = this.createNebulaTexture(random, randomRange(random, 175, 225), randomRange(random, 285, 345));
            const position = new this.THREE.Vector3(
                randomRange(random, -9.8, 9.8) * radius,
                randomRange(random, -4.8, 4.6) * radius,
                randomRange(random, -18.5, -12.5) * radius
            );
            const sprite = this.createSprite(texture, position, randomRange(random, 8, 13) * radius, randomRange(random, 0.12, 0.24));
            sprite.material.rotation = randomRange(random, -Math.PI, Math.PI);
            this.nebulas.push({
                sprite,
                baseOpacity: sprite.material.opacity,
                pulseAmount: randomRange(random, 0.018, 0.045),
                pulseSpeed: randomRange(random, 0.16, 0.32),
                rotationSpeed: randomRange(random, -0.00032, 0.00032),
                phase: seed * 0.01 + i
            });
        }
    }

    createAccretionDiskTexture(seed) {
        const { THREE } = this;
        const random = makeRandom(seed);
        const size = 768;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(size, size);
        const center = size / 2;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = (x - center) / center;
                const dy = (y - center) / center;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                const t = (distance - 0.17) / 0.43;
                if (t < 0 || t > 1) continue;
                const hot = Math.exp(-Math.pow((t - 0.1) * 5.4, 2));
                const spiral = 0.72 + 0.28 * Math.sin(angle * 5.5 + t * 36 + seed * 0.021);
                const bands = 0.7 + 0.3 * Math.sin(t * 82 + angle * 2.1);
                const alpha = Math.pow(Math.sin(Math.PI * t), 0.78) * (0.3 + hot * 0.78) * spiral * bands;
                const color = new THREE.Color().setHSL((24 + hot * 25) / 360, 0.96, 0.48 + hot * 0.36);
                const index = (y * size + x) * 4;
                image.data[index] = color.r * 255;
                image.data[index + 1] = color.g * 255;
                image.data[index + 2] = color.b * 255;
                image.data[index + 3] = Math.min(255, alpha * 255);
            }
        }
        ctx.putImageData(image, 0, 0);
        for (let i = 0; i < 70; i++) {
            const distance = randomRange(random, 110, 320);
            const angle = random() * Math.PI * 2;
            ctx.fillStyle = `rgba(255,225,170,${randomRange(random, 0.035, 0.09)})`;
            ctx.fillRect(center + Math.cos(angle) * distance, center + Math.sin(angle) * distance, 2, 2);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
    }

    createBlackHoles(random, seed) {
        const { THREE } = this;
        const radius = this.planetRadius;
        const count = Math.min(2, Math.max(0, Math.floor(this.settings.cosmicBlackHoleCount || 1)));
        for (let i = 0; i < count; i++) {
            const group = new THREE.Group();
            const scale = randomRange(random, 2.7, 4.2) * radius;
            const disk = new THREE.Mesh(
                new THREE.RingGeometry(scale * 0.2, scale * 0.86, 192, 8),
                new THREE.MeshBasicMaterial({
                    map: this.createAccretionDiskTexture(seed + i * 101),
                    transparent: true,
                    opacity: 0.82,
                    side: THREE.DoubleSide,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                })
            );
            disk.rotation.x = randomRange(random, 0.48, 0.66) * Math.PI;
            disk.rotation.z = randomRange(random, -0.55, 0.55);

            const core = new THREE.Mesh(
                new THREE.SphereGeometry(scale * 0.18, 64, 40),
                new THREE.MeshBasicMaterial({ color: 0x000000 })
            );
            const lens = new THREE.Mesh(
                new THREE.SphereGeometry(scale * 0.47, 64, 40),
                new THREE.MeshBasicMaterial({
                    color: 0xffb36b,
                    transparent: true,
                    opacity: 0.09,
                    side: THREE.BackSide,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                })
            );
            const halo = new THREE.Mesh(
                new THREE.TorusGeometry(scale * 0.34, scale * 0.016, 12, 160),
                new THREE.MeshBasicMaterial({ color: 0xffdfaa, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false })
            );
            halo.rotation.copy(disk.rotation);
            group.add(lens, disk, halo, core);
            group.position.set(
                randomRange(random, -9.5, 9.5) * radius,
                randomRange(random, -3.6, 3.6) * radius,
                randomRange(random, -20.5, -13.5) * radius
            );
            group.rotation.y = randomRange(random, -0.2, 0.2);
            this.group.add(group);
            this.blackHoles.push({
                group,
                lensRadius: scale * 0.74,
                strength: randomRange(random, 0.15, 0.22)
            });
            this.animatables.push({
                update: (timeScale) => {
                    disk.rotation.z += 0.0045 * timeScale;
                    halo.rotation.z -= 0.002 * timeScale;
                    lens.rotation.y += 0.0008 * timeScale;
                }
            });
        }
    }

    createCometTailMaterial() {
        const { THREE } = this;
        return new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                colorA: { value: new THREE.Color(0xdff8ff) },
                colorB: { value: new THREE.Color(0x6aa8ff) }
            },
            vertexShader: `
                attribute float aAlpha;
                attribute float aSize;
                varying float vAlpha;
                void main() {
                    vAlpha = aAlpha;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = aSize * (220.0 / max(18.0, -mvPosition.z));
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 colorA;
                uniform vec3 colorB;
                varying float vAlpha;
                void main() {
                    vec2 uv = gl_PointCoord - vec2(0.5);
                    float d = length(uv);
                    float core = smoothstep(0.5, 0.05, d);
                    float feather = smoothstep(0.5, 0.18, d);
                    vec3 color = mix(colorB, colorA, core);
                    gl_FragColor = vec4(color, vAlpha * feather);
                }
            `
        });
    }

    resetComet(comet, random) {
        const radius = this.planetRadius;
        const fromLeft = random() > 0.5;
        comet.group.position.set(
            (fromLeft ? -1 : 1) * randomRange(random, 11.5, 16) * radius,
            randomRange(random, -4.6, 5.2) * radius,
            randomRange(random, -17, -9.5) * radius
        );
        comet.velocity.set(
            (fromLeft ? 1 : -1) * randomRange(random, 0.035, 0.075) * radius,
            randomRange(random, -0.011, 0.011) * radius,
            randomRange(random, -0.004, 0.006) * radius
        );
        comet.lifeLimit = randomRange(random, 23, 34) * radius;
        comet.distanceTravelled = 0;
        comet.random = random;
        comet.tailDirection.copy(comet.velocity).normalize().multiplyScalar(-1);
        comet.tailRight.set(-comet.tailDirection.y, comet.tailDirection.x, 0).normalize();
        if (comet.tailRight.lengthSq() < 0.01) comet.tailRight.set(1, 0, 0);
        comet.tailUp.crossVectors(comet.tailDirection, comet.tailRight).normalize();
        for (let i = 0; i < comet.particleCount; i++) {
            this.recycleCometParticle(comet, i, random, true);
        }
        this.alignComet(comet);
    }

    alignComet(comet) {
        comet.coreGlow.scale.setScalar((0.68 + comet.tailIntensity * 0.08) * this.planetRadius);
    }

    recycleCometParticle(comet, index, random, spread = false) {
        const radius = this.planetRadius;
        const tailIntensity = comet.tailIntensity;
        const base = index * 3;
        const startOffset = spread ? randomRange(random, 0.2, 1.0) : randomRange(random, 0.02, 0.13);
        const lateral = randomRange(random, -0.08, 0.08) * radius * (0.65 + tailIntensity * 0.35);
        const vertical = randomRange(random, -0.06, 0.06) * radius * (0.65 + tailIntensity * 0.3);
        comet.positions[base] = comet.tailDirection.x * startOffset * radius * tailIntensity + comet.tailRight.x * lateral + comet.tailUp.x * vertical;
        comet.positions[base + 1] = comet.tailDirection.y * startOffset * radius * tailIntensity + comet.tailRight.y * lateral + comet.tailUp.y * vertical;
        comet.positions[base + 2] = comet.tailDirection.z * startOffset * radius * tailIntensity + comet.tailRight.z * lateral + comet.tailUp.z * vertical;

        const drift = randomRange(random, 0.018, 0.055) * radius * tailIntensity;
        const bloom = randomRange(random, 0.002, 0.012) * radius;
        comet.velocities[base] = comet.tailDirection.x * drift + comet.tailRight.x * bloom * randomRange(random, -1, 1);
        comet.velocities[base + 1] = comet.tailDirection.y * drift + comet.tailUp.y * bloom * randomRange(random, -1, 1);
        comet.velocities[base + 2] = comet.tailDirection.z * drift + randomRange(random, -0.004, 0.004) * radius;
        comet.ages[index] = spread ? randomRange(random, 0, comet.lifetimes[index] || 1) : 0;
        comet.lifetimes[index] = randomRange(random, 0.85, 1.85) * (0.85 + tailIntensity * 0.4);
        comet.sizes[index] = randomRange(random, 0.16, 0.54) * radius * (0.78 + tailIntensity * 0.22);
        comet.alphas[index] = randomRange(random, 0.38, 0.92);
        comet.phases[index] = random() * Math.PI * 2;
    }

    updateComet(comet, timeScale, elapsedTime) {
        this.tempVector.copy(comet.velocity).multiplyScalar(timeScale);
        comet.group.position.add(this.tempVector);
        comet.distanceTravelled += this.tempVector.length();
        comet.core.rotation.y += 0.018 * timeScale;
        const pulse = 0.78 + Math.sin((elapsedTime || 0) * 3.4 + comet.phase) * 0.16;
        comet.coreGlow.material.opacity = pulse;
        comet.core.scale.setScalar(1 + (pulse - 0.78) * 0.18);

        for (let i = 0; i < comet.particleCount; i++) {
            const base = i * 3;
            comet.ages[i] += 0.018 * timeScale;
            if (comet.ages[i] >= comet.lifetimes[i]) {
                this.recycleCometParticle(comet, i, comet.random, false);
                continue;
            }
            const ageT = comet.ages[i] / comet.lifetimes[i];
            const wave = Math.sin((elapsedTime || 0) * 2.1 + comet.phases[i] + ageT * 5.0) * 0.006 * this.planetRadius * comet.tailIntensity;
            comet.positions[base] += (comet.velocities[base] + comet.tailRight.x * wave) * timeScale;
            comet.positions[base + 1] += (comet.velocities[base + 1] + comet.tailUp.y * wave) * timeScale;
            comet.positions[base + 2] += (comet.velocities[base + 2] + comet.tailRight.z * wave) * timeScale;
            const shimmer = 0.72 + Math.sin((elapsedTime || 0) * 1.7 + comet.phases[i]) * 0.18;
            comet.alphas[i] = Math.pow(1 - ageT, 1.35) * shimmer;
            comet.sizes[i] *= 0.9992;
        }
        comet.geometry.attributes.position.needsUpdate = true;
        comet.geometry.attributes.aAlpha.needsUpdate = true;
        comet.geometry.attributes.aSize.needsUpdate = true;
        if (comet.distanceTravelled > comet.lifeLimit || Math.abs(comet.group.position.x) > this.planetRadius * 18) {
            this.resetComet(comet, comet.random);
            comet.geometry.attributes.position.needsUpdate = true;
            comet.geometry.attributes.aAlpha.needsUpdate = true;
            comet.geometry.attributes.aSize.needsUpdate = true;
        }
    }

    createComets(random, count) {
        const { THREE } = this;
        const cappedCount = Math.min(10, Math.max(0, Math.floor(count)));
        const tailIntensity = Math.max(0.35, Number(this.settings.cosmicCometTailIntensity || 1));
        for (let i = 0; i < cappedCount; i++) {
            const group = new THREE.Group();
            const core = new THREE.Mesh(
                new THREE.SphereGeometry(0.075 * this.planetRadius, 16, 12),
                new THREE.MeshBasicMaterial({ color: 0xeaffff })
            );
            const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.createGlowTexture('rgba(235,255,255,0.9)', 'rgba(80,175,255,0.02)', 256),
                transparent: true,
                opacity: 0.78,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            }));
            coreGlow.scale.setScalar(0.75 * this.planetRadius);
            const particleCount = Math.min(120, Math.floor(34 + tailIntensity * 30));
            const positions = new Float32Array(particleCount * 3);
            const velocities = new Float32Array(particleCount * 3);
            const alphas = new Float32Array(particleCount);
            const sizes = new Float32Array(particleCount);
            const ages = new Float32Array(particleCount);
            const lifetimes = new Float32Array(particleCount);
            const phases = new Float32Array(particleCount);
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
            geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
            const particles = new THREE.Points(geometry, this.createCometTailMaterial());
            particles.frustumCulled = false;
            group.add(particles, coreGlow, core);
            this.group.add(group);
            const comet = {
                group,
                core,
                coreGlow,
                particles,
                geometry,
                positions,
                velocities,
                alphas,
                sizes,
                ages,
                lifetimes,
                phases,
                particleCount,
                tailIntensity,
                velocity: new THREE.Vector3(),
                tailDirection: new THREE.Vector3(),
                tailRight: new THREE.Vector3(1, 0, 0),
                tailUp: new THREE.Vector3(0, 1, 0),
                distanceTravelled: 0,
                lifeLimit: 1,
                phase: random() * Math.PI * 2,
                random: makeRandom(this.seed + i * 997)
            };
            this.resetComet(comet, comet.random);
            comet.group.position.x += randomRange(random, -12, 12) * this.planetRadius;
            this.comets.push(comet);
        }
    }

    createStation(random, index) {
        const { THREE } = this;
        const group = new THREE.Group();
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xb6c3d6, roughness: 0.45, metalness: 0.65 });
        const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x1d5f9f, emissive: 0x062f5d, emissiveIntensity: 0.35, roughness: 0.34, metalness: 0.25 });
        const lightMaterial = new THREE.MeshBasicMaterial({ color: 0x8df6ff, transparent: true, opacity: 0.9 });
        const model = new THREE.Group();

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.22), bodyMaterial);
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 12), bodyMaterial);
        spine.rotation.z = Math.PI / 2;
        const panelA = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.025, 0.24), panelMaterial);
        const panelB = panelA.clone();
        panelA.position.x = -0.58;
        panelB.position.x = 0.58;
        const antenna = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.24, 16), bodyMaterial);
        antenna.position.y = 0.22;
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), lightMaterial);
        light.position.z = 0.15;

        model.add(body, spine, panelA, panelB, antenna, light);
        model.scale.setScalar(randomRange(random, 0.084, 0.124) * this.planetRadius);
        group.add(model);

        const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.createGlowTexture('rgba(170,255,255,0.95)', 'rgba(70,160,255,0.02)', 128),
            transparent: true,
            opacity: 0.72,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        }));
        beacon.scale.setScalar(randomRange(random, 0.14, 0.2) * this.planetRadius);
        group.add(beacon);

        const pivot = new THREE.Group();
        const distance = randomRange(random, 1.75, 2.45) * this.planetRadius;
        const angle = random() * Math.PI * 2;
        group.position.set(Math.cos(angle) * distance, randomRange(random, -0.22, 0.28) * this.planetRadius, Math.sin(angle) * distance);
        group.lookAt(0, 0, 0);
        pivot.rotation.x = randomRange(random, -0.45, 0.45);
        pivot.rotation.z = randomRange(random, -0.2, 0.2);
        pivot.add(group);
        this.group.add(pivot);
        this.animatables.push({
            update: (timeScale) => {
                pivot.rotation.y += (0.0012 + index * 0.00018) * timeScale;
                model.rotation.z += 0.002 * timeScale;
                group.getWorldPosition(this.tempVector);
                const distanceToCamera = this.tempVector.distanceTo(this.camera.position);
                model.visible = distanceToCamera < this.planetRadius * 7.5;
                beacon.visible = !model.visible || distanceToCamera > this.planetRadius * 3.2;
                const blink = 0.62 + Math.sin(performance.now() * 0.004 + index) * 0.28;
                light.material.opacity = blink;
                beacon.material.opacity = blink * 0.75;
            }
        });
    }

    createStations(random, count) {
        const cappedCount = Math.min(8, Math.max(0, Math.floor(count)));
        for (let i = 0; i < cappedCount; i++) this.createStation(random, i);
    }

    createOrbitLine(radius, color, opacity = 0.13) {
        const { THREE } = this;
        const geometry = new THREE.RingGeometry(radius - 0.018, radius + 0.018, 160);
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = Math.PI / 2;
        return ring;
    }

    createProceduralSolarSystem(random) {
        const { THREE } = this;
        const radius = this.planetRadius;
        const system = new THREE.Group();
        system.name = 'ProceduralBackgroundSolarSystem';
        system.position.set(randomRange(random, -5.5, 5.2) * radius, randomRange(random, -2.4, 3.0) * radius, randomRange(random, -18.5, -12.5) * radius);
        system.rotation.x = randomRange(random, -0.34, 0.34);
        system.rotation.z = randomRange(random, -0.18, 0.18);
        this.group.add(system);

        const starColor = pick(random, [0xffd9a3, 0xaedcff, 0xffb08a, 0xf4fff7]);
        const star = new THREE.Mesh(
            new THREE.SphereGeometry(randomRange(random, 0.42, 0.75) * radius, 32, 20),
            new THREE.MeshBasicMaterial({ color: starColor })
        );
        const starGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.createGlowTexture('rgba(255,235,180,0.86)', 'rgba(255,110,65,0.02)', 256),
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        }));
        starGlow.scale.setScalar(4.2 * radius);
        system.add(star, starGlow);

        const planetCount = Math.min(8, Math.max(0, Math.floor(this.settings.cosmicPlanetCount || 0)));
        for (let i = 0; i < planetCount; i++) {
            const pivot = new THREE.Group();
            const orbitRadius = (1.35 + i * 0.82 + randomRange(random, -0.12, 0.22)) * radius;
            if (this.settings.cosmicOrbitLinesEnabled) pivot.add(this.createOrbitLine(orbitRadius, 0x85a7ff, 0.09));
            const planet = new THREE.Mesh(
                new THREE.SphereGeometry(randomRange(random, 0.11, 0.28) * radius, 24, 16),
                new THREE.MeshStandardMaterial({
                    color: pick(random, [0x6e8fb8, 0xbc8a66, 0x9c77cc, 0xd4b784, 0x8bbfa5, 0xb7c8d6]),
                    roughness: 0.66,
                    metalness: 0.04
                })
            );
            const angle = random() * Math.PI * 2;
            planet.position.set(Math.cos(angle) * orbitRadius, randomRange(random, -0.15, 0.15) * radius, Math.sin(angle) * orbitRadius);
            pivot.rotation.y = random() * Math.PI * 2;
            pivot.add(planet);

            if (random() > 0.62) {
                const ring = new THREE.Mesh(
                    new THREE.RingGeometry(planet.geometry.parameters.radius * 1.45, planet.geometry.parameters.radius * 2.35, 64),
                    new THREE.MeshBasicMaterial({ color: 0xd8d0c0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
                );
                ring.rotation.x = Math.PI / 2.4;
                planet.add(ring);
            }
            if (random() > 0.46) {
                const moon = new THREE.Mesh(
                    new THREE.SphereGeometry(planet.geometry.parameters.radius * randomRange(random, 0.18, 0.28), 12, 8),
                    new THREE.MeshStandardMaterial({ color: 0xc7c0b4, roughness: 0.86 })
                );
                moon.position.set(planet.geometry.parameters.radius * 2.8, 0, 0);
                planet.add(moon);
            }

            system.add(pivot);
            this.animatables.push({
                update: (timeScale) => {
                    pivot.rotation.y += (0.00016 + i * 0.000026) * timeScale;
                    planet.rotation.y += (0.003 + i * 0.0004) * timeScale;
                }
            });
        }

        this.createBackgroundAsteroids(random, system);
    }

    createBackgroundAsteroids(random, system) {
        const { THREE } = this;
        const count = 46;
        const radius = this.planetRadius;
        const geometry = new THREE.DodecahedronGeometry(0.035 * radius, 0);
        const material = new THREE.MeshStandardMaterial({ color: 0x776f68, roughness: 0.9, metalness: 0.04 });
        const mesh = new THREE.InstancedMesh(geometry, material, count);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const euler = new THREE.Euler();
        for (let i = 0; i < count; i++) {
            const angle = random() * Math.PI * 2;
            const distance = randomRange(random, 2.1, 6.8) * radius;
            position.set(Math.cos(angle) * distance, randomRange(random, -0.38, 0.38) * radius, Math.sin(angle) * distance);
            euler.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
            quaternion.setFromEuler(euler);
            scale.setScalar(randomRange(random, 0.55, 1.75));
            matrix.compose(position, quaternion, scale);
            mesh.setMatrixAt(i, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        system.add(mesh);
        this.animatables.push({
            update: (timeScale) => {
                mesh.rotation.y += 0.00022 * timeScale;
                mesh.rotation.x += 0.00004 * timeScale;
            }
        });
    }
}
