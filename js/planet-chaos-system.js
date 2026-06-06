import { PlanetDamageSystem } from './planet-damage-system.js';
import { PlanetImpactEffects } from './planet-impact-effects.js';
import { PlanetFractureSystem } from './planet-fracture-system.js';

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function randomTangent(THREE, normal) {
    const helper = Math.abs(normal.y) > 0.82 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3().crossVectors(helper, normal).normalize().applyAxisAngle(normal, Math.random() * Math.PI * 2);
}

const CHAOS_PRESETS = {
    low: {
        maxEffects: 38,
        maxFragments: 22,
        maxParticlesPerBurst: 36,
        laserHz: 10,
        continuousHz: 6,
        maxMeteorShower: 3,
        fragmentScale: 0.35,
        particleScale: 0.45,
        enableExitParticles: false
    },
    medium: {
        maxEffects: 72,
        maxFragments: 56,
        maxParticlesPerBurst: 70,
        laserHz: 14,
        continuousHz: 8,
        maxMeteorShower: 4,
        fragmentScale: 0.65,
        particleScale: 0.7,
        enableExitParticles: true
    },
    high: {
        maxEffects: 120,
        maxFragments: 110,
        maxParticlesPerBurst: 120,
        laserHz: 18,
        continuousHz: 10,
        maxMeteorShower: 6,
        fragmentScale: 1,
        particleScale: 1,
        enableExitParticles: true
    },
    ultra: {
        maxEffects: 150,
        maxFragments: 135,
        maxParticlesPerBurst: 150,
        laserHz: 20,
        continuousHz: 11,
        maxMeteorShower: 7,
        fragmentScale: 1.08,
        particleScale: 1.05,
        enableExitParticles: true
    },
    cinematic: {
        maxEffects: 180,
        maxFragments: 160,
        maxParticlesPerBurst: 180,
        laserHz: 22,
        continuousHz: 12,
        maxMeteorShower: 7,
        fragmentScale: 1.15,
        particleScale: 1.1,
        enableExitParticles: true
    }
};

function collectMeshes(root, output) {
    if (!root) return output;
    root.traverse((node) => {
        if (node.isMesh && node.visible) output.push(node);
    });
    return output;
}

export class PlanetChaosSystem {
    constructor(options) {
        this.THREE = options.THREE;
        this.scene = options.scene;
        this.camera = options.camera;
        this.renderer = options.renderer;
        this.controls = options.controls;
        this.radius = options.planetRadius || 10;
        this.getPlanetMesh = options.getPlanetMesh || (() => null);
        this.getPlanetSurfaceGroup = options.getPlanetSurfaceGroup || (() => null);
        this.getLocalTargets = options.getLocalTargets || (() => []);
        this.getDinoSystem = options.getDinoSystem || (() => null);
        this.getVegetationSystem = options.getVegetationSystem || (() => null);
        this.fluidEffects = options.fluidEffects || null;
        this.toolbar = options.toolbar;
        this.raycaster = new this.THREE.Raycaster();
        this.pointer = new this.THREE.Vector2();
        this.damage = new PlanetDamageSystem({ THREE: this.THREE, radius: this.radius });
        this.effects = new PlanetImpactEffects({ THREE: this.THREE, scene: this.scene });
        this.fracture = new PlanetFractureSystem({ THREE: this.THREE, scene: this.scene, radius: this.radius });
        this.lastHit = null;
        this.dragging = false;
        this.activeTool = this.toolbar?.getState().tool || 'meteor';
        this.actionCooldown = 0;
        this.laserCooldown = 0;
        this.laserUndoOpen = false;
        this.performance = { ...CHAOS_PRESETS.medium };
        this.reticle = this.createReticle();
        this.bindEvents();
        this.configure(options.performance || {});
    }

    bindEvents() {
        this.onPointerMove = (event) => this.handlePointerMove(event);
        this.onPointerDown = (event) => this.handlePointerDown(event);
        this.onPointerUp = () => this.handlePointerUp();
        this.onDblClick = (event) => this.handleDoubleClick(event);
        this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointerup', this.onPointerUp);
        this.renderer.domElement.addEventListener('dblclick', this.onDblClick);

        this.toolbar?.addEventListener('tool-change', (event) => {
            this.activeTool = event.detail.tool;
        });
        this.toolbar?.addEventListener('reset', () => {
            this.damage.reset();
            this.fracture.clear();
        });
        this.toolbar?.addEventListener('fragmentsVisible', (event) => this.fracture.setVisible(event.detail.fragmentsVisible));
        this.toolbar?.addEventListener('undo', () => this.damage.undo());
        this.toolbar?.addEventListener('redo', () => this.damage.redo());
    }

    createReticle() {
        const THREE = this.THREE;
        const reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.92, 1, 64),
            new THREE.MeshBasicMaterial({
                color: 0x9ed8ff,
                transparent: true,
                opacity: 0.75,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        reticle.visible = false;
        reticle.renderOrder = 8;
        this.scene.add(reticle);
        return reticle;
    }

    setPlanet(mesh, surfaceGroup) {
        this.damage.setPlanet(mesh, surfaceGroup);
        this.lastHit = null;
        this.reticle.visible = false;
    }

    configure(settings = {}) {
        const presetName = settings.chaosQuality || settings.graphicsPreset || 'medium';
        const preset = CHAOS_PRESETS[presetName] || CHAOS_PRESETS.medium;
        this.performance = {
            ...preset,
            chaosQuality: presetName,
            maxEffects: Math.max(12, settings.chaosMaxEffects || preset.maxEffects),
            maxFragments: Math.max(0, settings.chaosMaxFragments ?? preset.maxFragments)
        };
        this.effects.configure?.(this.performance);
        this.fracture.configure?.(this.performance);
        this.damage.configure?.(this.performance);
        this.fluidEffects?.configure?.(settings);
    }

    getStats() {
        return {
            effects: this.effects.getActiveCount?.() || 0,
            fragments: this.fracture.getActiveCount?.() || 0
        };
    }

    reduceQualityStep() {
        this.configure({
            chaosQuality: 'low',
            chaosMaxEffects: Math.max(20, Math.floor((this.performance.maxEffects || 72) * 0.72)),
            chaosMaxFragments: Math.max(12, Math.floor((this.performance.maxFragments || 56) * 0.65))
        });
        this.fracture.trimToLimit?.();
        this.effects.trimToLimit?.();
    }

    getState() {
        return this.toolbar?.getState() || {};
    }

    isPaused() {
        return Boolean(this.getState().paused);
    }

    pointerToNdc(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    }

    buildRaycastTargets() {
        const targets = [];
        const planet = this.getPlanetMesh();
        if (planet?.isMesh) targets.push(planet);
        const seen = new Set(targets);
        this.getLocalTargets().forEach((target) => {
            collectMeshes(target, targets);
        });
        return targets.filter((target) => {
            if (seen.has(target)) return false;
            seen.add(target);
            return true;
        }).concat(planet?.isMesh ? [planet] : []).filter((target, index, list) => target && list.indexOf(target) === index);
    }

    raycast(event) {
        this.pointerToNdc(event);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const planet = this.getPlanetMesh();
        const targets = this.buildRaycastTargets();
        const hits = this.raycaster.intersectObjects(targets, false);
        if (!hits.length) return null;
        const hit = hits[0];
        const isPlanet = hit.object === planet;
        const normalWorld = this.getHitNormal(hit);
        return { ...hit, isPlanet, normalWorld };
    }

    getHitNormal(hit) {
        if (hit.face?.normal) {
            const normalMatrix = new this.THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
            return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        }
        return hit.point.clone().sub(this.getPlanetSurfaceGroup()?.position || new this.THREE.Vector3()).normalize();
    }

    handlePointerMove(event) {
        if (this.isPaused()) {
            this.reticle.visible = false;
            return;
        }
        const hit = this.raycast(event);
        this.lastHit = hit;
        this.updateReticle(hit);
    }

    handlePointerDown(event) {
        if (event.button !== 0 || this.isPaused()) return;
        const hit = this.raycast(event);
        if (!hit) return;
        event.preventDefault();
        this.lastHit = hit;
        this.dragging = true;
        this.controls.enabled = false;
        this.actionCooldown = 0;
        const state = this.getState();
        if (!hit.isPlanet) {
            this.hitLocalObject(hit);
            return;
        }
        if (state.tool === 'laser') {
            this.damage.pushUndo();
            this.laserUndoOpen = true;
            this.useLaser(hit, true);
        } else {
            this.useCurrentTool(hit);
        }
    }

    handlePointerUp() {
        this.dragging = false;
        this.laserUndoOpen = false;
        this.controls.enabled = true;
    }

    handleDoubleClick(event) {
        if (this.isPaused()) return;
        const hit = this.raycast(event);
        if (!hit?.isPlanet) return;
        const state = this.getState();
        if (state.tool === 'meteor') {
            this.launchMeteorShower(hit, 7);
        } else if (state.tool === 'regen') {
            this.damage.reset();
        }
    }

    updateReticle(hit) {
        if (!hit?.isPlanet || !this.getPlanetMesh()?.isMesh) {
            this.reticle.visible = false;
            return;
        }
        const state = this.getState();
        const radius = this.toolRadius(state) * 0.82;
        this.reticle.visible = true;
        this.reticle.position.copy(hit.point).addScaledVector(hit.normalWorld, 0.08);
        this.reticle.quaternion.setFromUnitVectors(new this.THREE.Vector3(0, 0, 1), hit.normalWorld);
        this.reticle.scale.setScalar(radius);
        const color = state.tool === 'laser' ? 0xff4569 : state.tool === 'freeze' ? 0xc8f4ff : state.tool === 'regen' ? 0x93ffbf : 0xffb15e;
        this.reticle.material.color.setHex(color);
    }

    update(deltaTime) {
        const state = this.getState();
        const timeScale = state.slowMotion ? 0.32 : 1;
        this.effects.update(deltaTime, timeScale);
        this.fracture.update(deltaTime, timeScale);
        if (this.isPaused()) return;
        this.actionCooldown -= deltaTime || 0.016;
        this.laserCooldown -= deltaTime || 0.016;
        if (!this.dragging || !this.lastHit?.isPlanet) return;
        if (state.tool === 'laser' && this.laserCooldown <= 0) {
            this.useLaser(this.lastHit, false);
            this.laserCooldown = 1 / Math.max(4, this.performance.laserHz || 14);
        } else if (state.continuous && (state.tool === 'freeze' || state.tool === 'regen') && this.actionCooldown <= 0) {
            this.useCurrentTool(this.lastHit, true);
            this.actionCooldown = 1 / Math.max(3, this.performance.continuousHz || 8);
        }
    }

    useCurrentTool(hit, continuous = false) {
        const state = this.getState();
        if (state.tool === 'meteor') {
            if (state.meteorShower) this.launchMeteorShower(hit, 5);
            else this.launchMeteor(hit);
        } else if (state.tool === 'freeze') {
            this.useFreeze(hit);
        } else if (state.tool === 'regen') {
            this.damage.applyRegeneration(hit.point, { radius: this.toolRadius(state) * 1.15, strength: state.power });
            this.getVegetationSystem?.()?.regrow?.(hit.point, this.toolRadius(state) * 1.35, state.power);
        }
    }

    toolRadius(state = this.getState()) {
        return this.radius * (0.12 + clamp(state.radius ?? 0.4, 0.05, 1) * 0.75);
    }

    toolStrength(state = this.getState()) {
        return clamp((state.power ?? 0.6) * (state.intensity ?? 0.6), 0.03, 1);
    }

    launchMeteor(hit, offsetScale = 1) {
        const state = this.getState();
        const radius = this.toolRadius(state);
        const strength = this.toolStrength(state);
        const tangent = randomTangent(this.THREE, hit.normalWorld).multiplyScalar(radius * offsetScale * (Math.random() - 0.5));
        const end = hit.point.clone().add(tangent);
        const catastrophic = Boolean(state.catastrophic) || state.meteorType === 'explosive' && state.power > 0.82;
        const impactScale = catastrophic ? 2.15 : 1;
        const start = end.clone().addScaledVector(hit.normalWorld, this.radius * (3.7 + state.power * 2.2)).addScaledVector(randomTangent(this.THREE, hit.normalWorld), radius * 1.15);
        const meteorSize = this.radius * (0.05 + state.power * 0.085) * (catastrophic ? 1.35 : 1);
        this.effects.createMeteor({
            start,
            end,
            size: meteorSize,
            speed: 0.42 + state.power * 0.62,
            type: state.meteorType,
            onImpact: () => {
                this.damage.applyImpact(end, { radius: radius * impactScale, strength: Math.min(1, strength * impactScale), type: state.meteorType, scale: impactScale });
                this.getVegetationSystem?.()?.applyDamage?.(end, radius * impactScale, Math.min(1, strength * impactScale), 'meteor');
                const color = state.meteorType === 'icy' ? 0x8eeaff : state.meteorType === 'explosive' ? 0xffd166 : 0xff8138;
                this.effects.createExplosion(end, hit.normalWorld, { radius: radius * (catastrophic ? 1.7 : 0.95), color });
                if (catastrophic || state.meteorType === 'explosive') {
                    this.fluidEffects?.triggerFluidBurst?.(end, {
                        type: 'explosion',
                        radius: radius * (catastrophic ? 2.15 : 1.15),
                        color,
                        strength: catastrophic ? 1.1 : 0.72,
                        life: catastrophic ? 1.5 : 1.0
                    });
                }
                this.fracture.ejectFragments(end, hit.normalWorld, { radius: radius * impactScale, strength: Math.min(1, strength * impactScale), hot: state.meteorType !== 'icy', count: catastrophic ? 42 : undefined });
                this.fracture.createStructuralCracks(end, hit.normalWorld, { radius: radius * impactScale, hot: state.meteorType !== 'icy', count: catastrophic ? 10 : 5 });
                this.perturbNearbyObjects(end, radius * (catastrophic ? 3 : 1.6), strength * impactScale, color);
                this.launchNearbyDinos(end, radius * (catastrophic ? 2.5 : 1.25), strength * impactScale);
            }
        });
    }

    launchMeteorShower(hit, count = 5) {
        const cappedCount = Math.min(count, this.performance.maxMeteorShower || 4);
        for (let i = 0; i < cappedCount; i++) {
            setTimeout(() => this.launchMeteor(hit, 1.4 + i * 0.08), i * 130);
        }
    }

    useLaser(hit) {
        const state = this.getState();
        const radius = this.toolRadius(state) * 0.48;
        const strength = this.toolStrength(state) * 0.36;
        const start = this.camera.position.clone();
        const end = hit.point.clone().addScaledVector(hit.normalWorld, 0.08);
        const rayDirection = hit.point.clone().sub(this.camera.position).normalize();
        const laserMode = state.laserMode || 'pierce';
        this.effects.createLaserBeam(start, end, 0xff4569, this.radius * (0.006 + state.radius * 0.015));
        if (Math.random() > 0.58 || laserMode === 'annihilate') {
            this.fluidEffects?.triggerFluidBurst?.(end, {
                type: 'laser',
                radius: radius * (laserMode === 'annihilate' ? 1.35 : 0.75),
                color: laserMode === 'annihilate' ? 0xff8a55 : 0xff4569,
                strength: laserMode === 'annihilate' ? 0.75 : 0.42,
                life: 0.42
            });
        }
        const tunnel = this.damage.applyLaserTunnel(hit.point, rayDirection, { radius, strength: strength * (laserMode === 'annihilate' ? 2.2 : laserMode === 'cut' ? 1.35 : 1), mode: laserMode });
        if (tunnel?.exitWorld) {
            this.effects.createLaserBeam(hit.point, tunnel.exitWorld, 0xff263c, this.radius * (0.004 + state.radius * 0.012));
            this.effects.createLaserBeam(tunnel.exitWorld, tunnel.exitWorld.clone().addScaledVector(rayDirection, this.radius * 1.4), 0xff8a55, this.radius * (0.003 + state.radius * 0.01));
            if (Math.random() > 0.55) {
                this.effects.createParticles(tunnel.exitWorld, tunnel.exitNormalWorld || rayDirection, { count: 14, color: 0xff8a55, speed: radius * 0.55, spread: radius * 0.22, life: 0.45, size: 0.13 });
            }
        } else {
            this.damage.applyLaser(hit.point, { radius, strength, mode: laserMode });
        }
        this.getVegetationSystem?.()?.applyDamage?.(hit.point, radius * 1.2, strength * (laserMode === 'annihilate' ? 1.5 : 1), 'laser');
        if (laserMode === 'annihilate' && Math.random() > 0.82) {
            this.fracture.ejectFragments(hit.point, hit.normalWorld, { radius: radius * 1.4, strength: Math.min(1, strength * 2), hot: true, count: 8 });
        }
        if (Math.random() > 0.72) {
            this.effects.createParticles(end, hit.normalWorld, { count: 10, color: 0xff4f38, speed: radius * 0.42, spread: radius * 0.12, life: 0.35, size: 0.12 });
        }
        this.perturbNearbyObjects(hit.point, radius * 1.1, strength, 0xff4058);
    }

    useFreeze(hit) {
        const state = this.getState();
        const radius = this.toolRadius(state);
        const strength = this.toolStrength(state);
        this.damage.applyFreeze(hit.point, { radius, strength });
        this.effects.createParticles(hit.point, hit.normalWorld, { count: 34, color: 0xc8f4ff, speed: radius * 0.34, spread: radius * 0.22, life: 0.8, size: 0.16 });
    }

    hitLocalObject(hit) {
        const state = this.getState();
        const color = state.tool === 'freeze' ? 0xc8f4ff : state.tool === 'laser' ? 0xff4058 : 0xff8138;
        this.effects.damageObject(hit.object, hit.point, { radius: this.toolRadius(state) * 0.35, color });
        if (state.tool === 'laser') {
            this.effects.createLaserBeam(this.camera.position.clone(), hit.point, color, this.radius * 0.015);
        }
    }

    perturbNearbyObjects(point, radius, strength, color) {
        const targets = this.getLocalTargets();
        targets.forEach((target) => {
            target.traverse?.((node) => {
                if (!node.isMesh) return;
                const world = new this.THREE.Vector3();
                node.getWorldPosition(world);
                if (world.distanceTo(point) > radius) return;
                this.effects.damageObject(node, world, { radius: radius * 0.22, color });
                const push = world.clone().sub(point).normalize().multiplyScalar(strength * 0.22);
                if (node.parent) node.position.add(push);
            });
        });
    }

    launchNearbyDinos(point, radius, strength) {
        const dinoSystem = this.getDinoSystem?.();
        if (!dinoSystem?.population?.length) return;
        const survivors = [];
        dinoSystem.population.forEach((dino) => {
            if (!dino.group) return;
            const world = new this.THREE.Vector3();
            dino.group.getWorldPosition(world);
            const distance = world.distanceTo(point);
            if (distance > radius || Math.random() > Math.min(0.92, strength * 0.65)) {
                survivors.push(dino);
                return;
            }
            const normal = world.clone().sub(point).normalize();
            this.fracture.ejectFragments(world, normal, { radius: this.radius * 0.18, strength: Math.min(1, strength), count: 3, hot: true, palette: [0x3a241c, 0x6e3a22, 0xff6a33] });
            dino.group.parent?.remove(dino.group);
        });
        dinoSystem.population = survivors;
    }

    dispose() {
        this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
        this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointerup', this.onPointerUp);
        this.renderer.domElement.removeEventListener('dblclick', this.onDblClick);
        this.reticle.parent?.remove(this.reticle);
        this.reticle.geometry.dispose();
        this.reticle.material.dispose();
        this.damage.dispose();
        this.fracture.dispose();
        this.effects.dispose();
    }
}
