const MAX_SPLATS = 8;

const QUALITY_PRESETS = {
    low: {
        resolution: 128,
        updateRate: 10,
        maxEffects: 4,
        nebulaCount: 1,
        decay: 0.965,
        diffusion: 0.06
    },
    medium: {
        resolution: 192,
        updateRate: 15,
        maxEffects: 7,
        nebulaCount: 2,
        decay: 0.972,
        diffusion: 0.08
    },
    high: {
        resolution: 256,
        updateRate: 24,
        maxEffects: 10,
        nebulaCount: 3,
        decay: 0.978,
        diffusion: 0.1
    },
    ultra: {
        resolution: 320,
        updateRate: 28,
        maxEffects: 12,
        nebulaCount: 3,
        decay: 0.98,
        diffusion: 0.11
    },
    cinematic: {
        resolution: 384,
        updateRate: 30,
        maxEffects: 14,
        nebulaCount: 3,
        decay: 0.982,
        diffusion: 0.12
    }
};

const DEFAULT_SETTINGS = {
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
    fluidMaxSimultaneous: 7
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

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

function disposeObject(object) {
    object.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (!child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
    });
}

function colorToVector(THREE, color, fallback = 0x78d8ff) {
    const parsed = new THREE.Color(color ?? fallback);
    return parsed;
}

class CosmicFluidEffects {
    constructor({ THREE, scene, camera, renderer, parentGroup, planetRadius = 10, settings = {} }) {
        this.THREE = THREE;
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.parentGroup = parentGroup || scene;
        this.planetRadius = planetRadius;
        this.settings = { ...DEFAULT_SETTINGS, ...settings };
        this.quality = { ...QUALITY_PRESETS.medium };
        this.group = new THREE.Group();
        this.group.name = 'CosmicFluidEffects';
        this.scene.add(this.group);

        this.clockTime = 0;
        this.accumulator = 0;
        this.ambientAccumulator = 0;
        this.pendingSplats = [];
        this.nebulas = [];
        this.bursts = [];
        this.followers = [];
        this.trails = new Map();
        this.materials = new Set();
        this.tempColor = new THREE.Color();
        this.tempPosition = new THREE.Vector3();
        this.tempProjected = new THREE.Vector3();
        this.random = makeRandom(1);

        this.simScene = new THREE.Scene();
        this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.simMaterial = this.createSimulationMaterial();
        this.simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMaterial);
        this.simScene.add(this.simQuad);

        this.configure(this.settings);
        this.rebuildTargets();
    }

    configure(settings = {}) {
        this.settings = { ...this.settings, ...settings };
        const presetName = this.settings.fluidQuality || this.settings.graphicsPreset || 'medium';
        const preset = QUALITY_PRESETS[presetName] || QUALITY_PRESETS.medium;
        this.quality = { ...preset };
        const explicitResolution = Number(this.settings.fluidInternalResolution || 0);
        if (explicitResolution > 0) this.quality.resolution = clamp(Math.floor(explicitResolution), 64, 512);
        const explicitRate = Number(this.settings.fluidUpdateRate || 0);
        if (explicitRate > 0) this.quality.updateRate = clamp(explicitRate, 4, 30);
        this.quality.maxEffects = clamp(Math.floor(this.settings.fluidMaxSimultaneous || this.quality.maxEffects), 1, 18);
        if (this.targetSize !== this.quality.resolution) this.rebuildTargets();
        this.group.visible = Boolean(this.settings.fluidEffectsEnabled);
        this.syncVisualVisibility();
        this.trimBursts();
    }

    setFluidQuality(quality) {
        this.configure({ fluidQuality: quality });
    }

    reduceQualityStep() {
        if (!this.settings.fluidEffectsEnabled) return null;
        const quality = this.settings.fluidQuality || 'medium';
        if (quality === 'cinematic') return { fluidQuality: 'ultra', fluidUpdateRate: 28, fluidInternalResolution: 320 };
        if (quality === 'ultra') return { fluidQuality: 'high', fluidUpdateRate: 24, fluidInternalResolution: 256 };
        if (quality === 'high') return { fluidQuality: 'medium', fluidUpdateRate: 15, fluidInternalResolution: 192 };
        if (quality === 'medium') return { fluidQuality: 'low', fluidUpdateRate: 10, fluidInternalResolution: 128 };
        return { fluidEffectsEnabled: false };
    }

    rebuild(seed = 1, settings = {}) {
        this.configure(settings);
        this.disposeVisuals();
        this.random = makeRandom(seed + 71117);
        if (this.settings.fluidEffectsEnabled && this.settings.fluidNebulasEnabled) {
            this.createFluidNebulas(seed);
        }
        this.seedAmbientField();
    }

    disposeVisuals() {
        this.nebulas.length = 0;
        this.bursts.length = 0;
        this.followers.length = 0;
        this.trails.clear();
        while (this.group.children.length) {
            const child = this.group.children[0];
            this.group.remove(child);
            disposeObject(child);
        }
        this.materials.clear();
    }

    dispose() {
        this.disposeVisuals();
        this.group.parent?.remove(this.group);
        this.simQuad.geometry.dispose();
        this.simMaterial.dispose();
        this.readTarget?.dispose();
        this.writeTarget?.dispose();
    }

    rebuildTargets() {
        const size = this.quality.resolution || 192;
        if (this.readTarget) this.readTarget.dispose();
        if (this.writeTarget) this.writeTarget.dispose();
        const options = {
            minFilter: this.THREE.LinearFilter,
            magFilter: this.THREE.LinearFilter,
            format: this.THREE.RGBAFormat,
            depthBuffer: false,
            stencilBuffer: false
        };
        this.readTarget = new this.THREE.WebGLRenderTarget(size, size, options);
        this.writeTarget = new this.THREE.WebGLRenderTarget(size, size, options);
        this.targetSize = size;
        this.resetTargets();
        this.updateMaterialTextures();
    }

    resetTargets() {
        if (!this.renderer || !this.readTarget || !this.writeTarget) return;
        const previousTarget = this.renderer.getRenderTarget();
        const clearColor = this.renderer.getClearColor(new this.THREE.Color()).clone();
        const clearAlpha = this.renderer.getClearAlpha();
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setRenderTarget(this.readTarget);
        this.renderer.clear(true, true, true);
        this.renderer.setRenderTarget(this.writeTarget);
        this.renderer.clear(true, true, true);
        this.renderer.setRenderTarget(previousTarget);
        this.renderer.setClearColor(clearColor, clearAlpha);
    }

    createSimulationMaterial() {
        const splats = Array.from({ length: MAX_SPLATS }, () => new this.THREE.Vector4(0, 0, 0, 0));
        const colors = Array.from({ length: MAX_SPLATS }, () => new this.THREE.Vector4(0, 0, 0, 0));
        return new this.THREE.ShaderMaterial({
            depthWrite: false,
            depthTest: false,
            uniforms: {
                previousTexture: { value: null },
                resolution: { value: new this.THREE.Vector2(192, 192) },
                time: { value: 0 },
                deltaTime: { value: 0.016 },
                decay: { value: 0.972 },
                diffusion: { value: 0.08 },
                intensity: { value: 0.68 },
                splatCount: { value: 0 },
                splats: { value: splats },
                splatColors: { value: colors }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D previousTexture;
                uniform vec2 resolution;
                uniform float time;
                uniform float deltaTime;
                uniform float decay;
                uniform float diffusion;
                uniform float intensity;
                uniform int splatCount;
                uniform vec4 splats[${MAX_SPLATS}];
                uniform vec4 splatColors[${MAX_SPLATS}];
                varying vec2 vUv;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
                        u.y
                    );
                }

                vec2 curlField(vec2 uv) {
                    float n1 = noise(uv * 4.5 + vec2(time * 0.035, -time * 0.02));
                    float n2 = noise(uv * 7.0 + vec2(-time * 0.025, time * 0.03));
                    float angle = (n1 * 6.28318) + sin((uv.x + uv.y) * 5.0 + time * 0.18) * 0.7;
                    vec2 base = vec2(cos(angle), sin(angle));
                    vec2 swirl = vec2(n2 - 0.5, n1 - 0.5);
                    return normalize(base * 0.65 + swirl * 0.35);
                }

                void main() {
                    vec2 texel = 1.0 / resolution;
                    vec2 flow = curlField(vUv) * deltaTime * (0.018 + diffusion * 0.05);
                    vec4 center = texture2D(previousTexture, vUv - flow);
                    vec4 blur = texture2D(previousTexture, vUv + vec2(texel.x, 0.0));
                    blur += texture2D(previousTexture, vUv - vec2(texel.x, 0.0));
                    blur += texture2D(previousTexture, vUv + vec2(0.0, texel.y));
                    blur += texture2D(previousTexture, vUv - vec2(0.0, texel.y));
                    vec4 fluid = mix(center, blur * 0.25, diffusion);
                    fluid.rgb *= decay;
                    fluid.a *= decay;

                    for (int i = 0; i < ${MAX_SPLATS}; i++) {
                        if (i >= splatCount) break;
                        vec4 splat = splats[i];
                        vec4 color = splatColors[i];
                        vec2 d = vUv - splat.xy;
                        d.x *= resolution.x / resolution.y;
                        float falloff = exp(-dot(d, d) / max(0.00001, splat.z * splat.z));
                        fluid.rgb += color.rgb * falloff * splat.w * intensity;
                        fluid.a = max(fluid.a, falloff * splat.w);
                    }

                    float wisps = noise(vUv * 8.0 + time * 0.015) * noise(vUv * 17.0 - time * 0.012);
                    fluid.rgb += vec3(0.035, 0.055, 0.09) * wisps * intensity * 0.018;
                    gl_FragColor = clamp(fluid, 0.0, 1.0);
                }
            `
        });
    }

    createFluidMaterial({ opacity = 0.45, tint = 0xffffff, cutoff = 0.02, alphaBoost = 1.0 } = {}) {
        const material = new this.THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: this.THREE.AdditiveBlending,
            uniforms: {
                fluidTexture: { value: this.readTarget?.texture || null },
                time: { value: 0 },
                opacity: { value: opacity },
                tint: { value: new this.THREE.Color(tint) },
                cutoff: { value: cutoff },
                alphaBoost: { value: alphaBoost }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform sampler2D fluidTexture;
                uniform float time;
                uniform float opacity;
                uniform vec3 tint;
                uniform float cutoff;
                uniform float alphaBoost;
                varying vec2 vUv;

                float vignette(vec2 uv) {
                    vec2 p = uv * 2.0 - 1.0;
                    return smoothstep(1.25, 0.08, dot(p, p));
                }

                void main() {
                    vec2 uv = vUv;
                    vec4 fluid = texture2D(fluidTexture, uv);
                    float lum = dot(fluid.rgb, vec3(0.299, 0.587, 0.114));
                    float alpha = smoothstep(cutoff, 0.42, lum) * vignette(uv) * opacity * alphaBoost;
                    vec3 color = fluid.rgb * tint * (1.05 + sin(time * 0.7 + uv.x * 8.0) * 0.05);
                    gl_FragColor = vec4(color, alpha);
                }
            `
        });
        this.materials.add(material);
        return material;
    }

    createFluidNebulas(seed) {
        const count = this.quality.nebulaCount || 2;
        const radius = this.planetRadius;
        for (let i = 0; i < count; i++) {
            const side = i % 2 ? 1 : -1;
            const material = this.createFluidMaterial({
                opacity: (0.18 + i * 0.045) * Number(this.settings.fluidIntensity || 0.68),
                tint: i % 2 ? 0xff8bd7 : 0x70d9ff,
                cutoff: 0.015,
                alphaBoost: 1.15
            });
            const nebula = new this.THREE.Mesh(new this.THREE.PlaneGeometry(1, 1, 1, 1), material);
            nebula.name = 'FluidNebula';
            nebula.position.set(
                side * (6.4 + this.random() * 3.2) * radius,
                (-2.6 + this.random() * 5.0) * radius,
                -(15.5 + this.random() * 5.5) * radius
            );
            const scale = (8.2 + this.random() * 5.5) * radius;
            nebula.scale.set(scale * (1.15 + this.random() * 0.55), scale, 1);
            nebula.renderOrder = -20;
            nebula.userData.phase = seed * 0.01 + i * 1.71;
            nebula.userData.baseOpacity = material.uniforms.opacity.value;
            this.group.add(nebula);
            this.nebulas.push(nebula);
            this.enqueueSplat({
                uv: [0.22 + this.random() * 0.56, 0.24 + this.random() * 0.52],
                radius: 0.16 + this.random() * 0.16,
                strength: 0.45,
                color: i % 2 ? 0xff65c8 : 0x58cfff
            });
        }
    }

    seedAmbientField() {
        for (let i = 0; i < 5; i++) {
            this.enqueueAmbientSplat(0.22 + i * 0.035);
        }
    }

    enqueueAmbientSplat(strength = 0.18) {
        if (!this.settings.fluidEffectsEnabled || !this.settings.fluidNebulasEnabled) return;
        const palette = [0x55d6ff, 0x8b7cff, 0xff70c8, 0xffb45f];
        this.enqueueSplat({
            uv: [0.12 + this.random() * 0.76, 0.12 + this.random() * 0.76],
            radius: 0.09 + this.random() * 0.18,
            strength,
            color: palette[Math.floor(this.random() * palette.length)]
        });
    }

    enqueueSplat({ uv, radius = 0.08, strength = 0.55, color = 0x7edfff }) {
        if (!this.settings.fluidEffectsEnabled) return;
        const parsed = colorToVector(this.THREE, color);
        this.pendingSplats.push({
            x: clamp(uv[0], 0, 1),
            y: clamp(uv[1], 0, 1),
            radius: clamp(radius, 0.01, 0.45),
            strength: clamp(strength, 0.02, 1.8),
            color: parsed
        });
        while (this.pendingSplats.length > MAX_SPLATS * 3) this.pendingSplats.shift();
    }

    worldToUv(position) {
        this.tempProjected.copy(position).project(this.camera);
        if (this.tempProjected.z < -1 || this.tempProjected.z > 1) return null;
        return [
            this.tempProjected.x * 0.5 + 0.5,
            this.tempProjected.y * 0.5 + 0.5
        ];
    }

    triggerFluidBurst(position, options = {}) {
        if (!this.settings.fluidEffectsEnabled) return null;
        const type = options.type || 'plasma';
        if (type === 'explosion' && !this.settings.fluidExplosionsEnabled) return null;
        if ((type === 'plasma' || type === 'laser') && !this.settings.fluidPlasmaEnabled) return null;
        if (this.bursts.length >= this.quality.maxEffects) this.removeBurst(this.bursts.shift());

        const world = position.clone ? position.clone() : new this.THREE.Vector3(position.x, position.y, position.z);
        const color = options.color || (type === 'laser' ? 0xff4569 : 0x78d8ff);
        const radius = Math.max(0.4, options.radius || this.planetRadius * 0.75);
        const uv = this.worldToUv(world) || [0.5, 0.5];
        this.enqueueSplat({
            uv,
            radius: clamp(0.05 + radius / (this.planetRadius * 26), 0.045, 0.19),
            strength: options.strength || 0.75,
            color
        });

        const material = this.createFluidMaterial({
            opacity: Math.min(0.8, (options.opacity || 0.42) * Number(this.settings.fluidIntensity || 0.68)),
            tint: color,
            cutoff: 0.01,
            alphaBoost: type === 'explosion' ? 1.7 : 1.25
        });
        const mesh = new this.THREE.Mesh(new this.THREE.PlaneGeometry(1, 1, 1, 1), material);
        mesh.name = 'FluidBurst';
        mesh.position.copy(world);
        mesh.scale.setScalar(radius);
        mesh.renderOrder = 15;
        const burst = {
            mesh,
            material,
            age: 0,
            life: options.life || (type === 'explosion' ? 1.25 : 0.55),
            baseScale: radius,
            expand: options.expand ?? (type === 'explosion' ? 1.65 : 0.6)
        };
        this.group.add(mesh);
        this.bursts.push(burst);
        return mesh;
    }

    triggerFluidTrail(object, options = {}) {
        if (!this.settings.fluidEffectsEnabled || !this.settings.fluidTrailsEnabled || !object) return null;
        if (this.trails.has(object)) return this.trails.get(object).mesh;
        const material = this.createFluidMaterial({
            opacity: options.opacity || 0.22,
            tint: options.color || 0x8be8ff,
            cutoff: 0.02,
            alphaBoost: 1.25
        });
        const mesh = new this.THREE.Mesh(new this.THREE.PlaneGeometry(1, 1, 1, 1), material);
        mesh.name = 'FluidTrail';
        mesh.renderOrder = 10;
        this.group.add(mesh);
        const trail = {
            mesh,
            target: object,
            material,
            age: 0,
            life: options.life || 3,
            scale: options.scale || this.planetRadius * 1.8,
            color: options.color || 0x8be8ff
        };
        this.trails.set(object, trail);
        return mesh;
    }

    attachBlackHoleFluid(target, options = {}) {
        if (!target || !this.settings.fluidEffectsEnabled || !this.settings.fluidBlackHolesEnabled) return null;
        const scale = options.scale || this.planetRadius * 3.4;
        const material = this.createFluidMaterial({
            opacity: (options.opacity || 0.28) * Number(this.settings.fluidIntensity || 0.68),
            tint: options.color || 0xffa45f,
            cutoff: 0.012,
            alphaBoost: 1.45
        });
        const mesh = new this.THREE.Mesh(new this.THREE.PlaneGeometry(1, 1, 1, 1), material);
        mesh.name = 'BlackHoleFluidPlasma';
        mesh.scale.set(scale * 1.55, scale, 1);
        mesh.renderOrder = 9;
        this.group.add(mesh);
        this.followers.push({
            target,
            mesh,
            material,
            radius: scale,
            color: options.color || 0xffa45f,
            phase: this.random() * Math.PI * 2
        });
        return mesh;
    }

    update(deltaTime = 0.016, elapsedTime = 0) {
        const dt = Math.min(0.05, deltaTime || 0.016);
        this.clockTime = elapsedTime || (this.clockTime + dt);
        if (!this.settings.fluidEffectsEnabled) {
            this.group.visible = false;
            return;
        }
        this.group.visible = true;

        this.updateSimulation(dt);
        this.updateVisuals(dt);
    }

    updateSimulation(dt) {
        const hiddenScale = document.hidden ? 0.25 : 1;
        const updateRate = Math.max(4, (this.quality.updateRate || 15) * hiddenScale);
        const interval = 1 / updateRate;
        this.accumulator += dt;
        this.ambientAccumulator += dt;
        if (this.ambientAccumulator >= (this.settings.fluidQuality === 'low' ? 1.7 : 0.9)) {
            this.enqueueAmbientSplat(this.settings.fluidQuality === 'low' ? 0.12 : 0.18);
            this.ambientAccumulator = 0;
        }
        if (this.accumulator < interval) return;
        const step = Math.min(0.12, this.accumulator);
        this.accumulator = 0;

        const splats = this.pendingSplats.splice(0, MAX_SPLATS);
        const uniforms = this.simMaterial.uniforms;
        uniforms.previousTexture.value = this.readTarget.texture;
        uniforms.resolution.value.set(this.targetSize, this.targetSize);
        uniforms.time.value = this.clockTime;
        uniforms.deltaTime.value = step;
        uniforms.decay.value = this.quality.decay;
        uniforms.diffusion.value = this.quality.diffusion;
        uniforms.intensity.value = Number(this.settings.fluidIntensity || 0.68);
        uniforms.splatCount.value = splats.length;
        for (let i = 0; i < MAX_SPLATS; i++) {
            const splat = splats[i];
            uniforms.splats.value[i].set(splat?.x || 0, splat?.y || 0, splat?.radius || 0, splat?.strength || 0);
            uniforms.splatColors.value[i].set(splat?.color.r || 0, splat?.color.g || 0, splat?.color.b || 0, 1);
        }

        const previousTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.writeTarget);
        this.renderer.render(this.simScene, this.simCamera);
        this.renderer.setRenderTarget(previousTarget);
        const swap = this.readTarget;
        this.readTarget = this.writeTarget;
        this.writeTarget = swap;
        this.updateMaterialTextures();
    }

    updateMaterialTextures() {
        this.materials.forEach((material) => {
            if (material.uniforms?.fluidTexture) material.uniforms.fluidTexture.value = this.readTarget?.texture || null;
        });
    }

    updateVisuals(dt) {
        const intensity = Number(this.settings.fluidIntensity || 0.68);
        this.nebulas.forEach((nebula, index) => {
            nebula.quaternion.copy(this.camera.quaternion);
            nebula.material.uniforms.time.value = this.clockTime;
            const pulse = 0.86 + Math.sin(this.clockTime * 0.35 + nebula.userData.phase) * 0.14;
            nebula.material.uniforms.opacity.value = nebula.userData.baseOpacity * pulse * intensity;
            nebula.rotation.z += (index % 2 ? -1 : 1) * dt * 0.012;
        });

        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const burst = this.bursts[i];
            burst.age += dt;
            const t = clamp(burst.age / burst.life, 0, 1);
            burst.mesh.quaternion.copy(this.camera.quaternion);
            burst.mesh.scale.setScalar(burst.baseScale * (1 + t * burst.expand));
            burst.material.uniforms.time.value = this.clockTime;
            burst.material.uniforms.opacity.value *= Math.max(0, 1 - t * 0.12);
            burst.material.uniforms.alphaBoost.value = Math.max(0, 1.35 * (1 - t));
            if (t >= 1) {
                this.removeBurst(burst);
                this.bursts.splice(i, 1);
            }
        }

        for (let i = this.followers.length - 1; i >= 0; i--) {
            const follower = this.followers[i];
            if (!follower.target.parent && follower.target !== this.scene) {
                this.removeFollower(follower);
                this.followers.splice(i, 1);
                continue;
            }
            follower.target.getWorldPosition(this.tempPosition);
            follower.mesh.position.copy(this.tempPosition);
            follower.mesh.quaternion.copy(this.camera.quaternion);
            const pulse = 0.9 + Math.sin(this.clockTime * 0.85 + follower.phase) * 0.12;
            follower.mesh.scale.set(follower.radius * 1.55 * pulse, follower.radius * pulse, 1);
            follower.material.uniforms.time.value = this.clockTime;
            const uv = this.worldToUv(this.tempPosition);
            if (uv) {
                this.enqueueSplat({
                    uv,
                    radius: 0.055,
                    strength: 0.18,
                    color: follower.color
                });
            }
        }

        this.trails.forEach((trail, target) => {
            if (!target.parent) {
                this.group.remove(trail.mesh);
                disposeObject(trail.mesh);
                this.trails.delete(target);
                return;
            }
            target.getWorldPosition(this.tempPosition);
            trail.mesh.position.copy(this.tempPosition);
            trail.mesh.quaternion.copy(this.camera.quaternion);
            trail.mesh.scale.set(trail.scale * 1.6, trail.scale, 1);
            trail.material.uniforms.time.value = this.clockTime;
            const uv = this.worldToUv(this.tempPosition);
            if (uv) {
                this.enqueueSplat({ uv, radius: 0.035, strength: 0.12, color: trail.color });
            }
        });
    }

    removeBurst(burst) {
        if (!burst?.mesh) return;
        this.group.remove(burst.mesh);
        this.materials.delete(burst.material);
        disposeObject(burst.mesh);
    }

    removeFollower(follower) {
        if (!follower?.mesh) return;
        this.group.remove(follower.mesh);
        this.materials.delete(follower.material);
        disposeObject(follower.mesh);
    }

    trimBursts() {
        while (this.bursts.length > this.quality.maxEffects) {
            this.removeBurst(this.bursts.shift());
        }
    }

    syncVisualVisibility() {
        const enabled = Boolean(this.settings.fluidEffectsEnabled);
        this.nebulas.forEach((nebula) => {
            nebula.visible = enabled && Boolean(this.settings.fluidNebulasEnabled);
        });
        this.followers.forEach((follower) => {
            follower.mesh.visible = enabled && Boolean(this.settings.fluidBlackHolesEnabled);
        });
        this.trails.forEach((trail) => {
            trail.mesh.visible = enabled && Boolean(this.settings.fluidTrailsEnabled);
        });
    }

    getStats() {
        return {
            activeFluidEffects: this.bursts.length + this.followers.length + this.trails.size,
            fluidResolution: this.targetSize || 0,
            fluidUpdateRate: this.quality.updateRate || 0
        };
    }
}

let activeFluidEffects = null;

export function createCosmicFluidEffects(options = {}) {
    activeFluidEffects = new CosmicFluidEffects(options);
    return activeFluidEffects;
}

export function updateCosmicFluidEffects(deltaTime, elapsedTime, instance = activeFluidEffects) {
    instance?.update(deltaTime, elapsedTime);
}

export function triggerFluidBurst(position, options, instance = activeFluidEffects) {
    return instance?.triggerFluidBurst(position, options);
}

export function triggerFluidTrail(object, options, instance = activeFluidEffects) {
    return instance?.triggerFluidTrail(object, options);
}

export function setFluidQuality(quality, instance = activeFluidEffects) {
    return instance?.setFluidQuality(quality);
}

export function disposeCosmicFluidEffects(instance = activeFluidEffects) {
    instance?.dispose();
    if (instance === activeFluidEffects) activeFluidEffects = null;
}
