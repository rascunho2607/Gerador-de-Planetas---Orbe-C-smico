const ARROWS = [
    { code: 'ArrowUp', symbol: '^' },
    { code: 'ArrowDown', symbol: 'v' },
    { code: 'ArrowLeft', symbol: '<' },
    { code: 'ArrowRight', symbol: '>' }
];

const REINFORCEMENT_SEQUENCES = {
    jeep: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
    ship: ['ArrowUp', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'ArrowDown']
};

const REINFORCEMENT_META = {
    jeep: {
        title: 'Jeep',
        icon: 'fa-car-side',
        description: 'Veiculo terrestre arcade para correr, saltar e explorar relevos.'
    },
    ship: {
        title: 'Nave espacial',
        icon: 'fa-rocket',
        description: 'Voo livre, boost, pouso suave e exploracao alem do planeta inicial.'
    }
};

const DROP_SPAWN_DISTANCE = 4.8;
const DROP_MIN_TRAVEL_TIME = 3.2;
const DROP_MAX_TRAVEL_TIME = 5.4;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function smoothFactor(speed, deltaTime) {
    return 1 - Math.exp(-Math.max(0.001, speed) * Math.max(0, deltaTime || 0));
}

function isEditableTarget(target) {
    return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

function disposeObject(node) {
    if (!node) return;
    node.parent?.remove(node);
    const geometries = new Set();
    const materials = new Set();
    node.traverse?.((child) => {
        if (child.geometry) geometries.add(child.geometry);
        if (child.material) {
            const list = Array.isArray(child.material) ? child.material : [child.material];
            list.forEach((material) => materials.add(material));
        }
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    materials.forEach((material) => material.dispose?.());
}

export class ReinforcementSystem {
    constructor(options = {}) {
        this.THREE = options.THREE;
        this.scene = options.scene;
        this.camera = options.camera;
        this.renderer = options.renderer;
        this.surfaceGroup = options.surfaceGroup;
        this.getPlanetMesh = options.getPlanetMesh || (() => null);
        this.getPlanetRadius = options.getPlanetRadius || (() => 10);
        this.getPlanetCenter = options.getPlanetCenter || (() => new this.THREE.Vector3());
        this.getPlanetSurfaceHeight = options.getPlanetSurfaceHeight || (() => 0);
        this.getChaosToolbar = options.getChaosToolbar || (() => null);
        this.getExplorationControls = options.getExplorationControls || (() => null);
        this.getVehicleSystem = options.getVehicleSystem || (() => null);
        this.getSettings = options.getSettings || (() => ({}));
        this.isRegenerating = options.isRegenerating || (() => false);

        this.state = {
            phase: 'idle',
            menuOpen: false,
            selectedType: null,
            sequence: [],
            inputSequence: [],
            currentIndex: 0,
            sequenceStartedAt: 0,
            feedback: ''
        };
        this.savedChaosToolsEnabled = null;
        this.dropPods = [];
        this.effects = [];
        this.raycaster = new this.THREE.Raycaster();
        this.ndcCenter = new this.THREE.Vector2(0, 0);
        this.tmpVecA = new this.THREE.Vector3();
        this.tmpVecB = new this.THREE.Vector3();
        this.tmpVecC = new this.THREE.Vector3();
        this.tmpQuat = new this.THREE.Quaternion();
        this.tmpMatrix = new this.THREE.Matrix4();

        this.createUi();
        this.createMarker();
        this.bindEvents();
    }

    bindEvents() {
        this.onKeyDown = (event) => this.handleKeyDown(event);
        this.onKeyUp = (event) => this.handleKeyUp(event);
        this.onPointerDown = (event) => this.handlePointerDown(event);
        this.onMouseMove = (event) => this.handleMouseMove(event);
        window.addEventListener('keydown', this.onKeyDown, true);
        window.addEventListener('keyup', this.onKeyUp, true);
        document.addEventListener('mousemove', this.onMouseMove);
        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown, true);
    }

    createUi() {
        if (!document.getElementById('reinforcementSystemStyles')) {
            const style = document.createElement('style');
            style.id = 'reinforcementSystemStyles';
            style.textContent = `
                .reinforcement-panel {
                    position: fixed;
                    left: 16px;
                    top: 16px;
                    z-index: 34;
                    width: min(360px, calc(100vw - 28px));
                    display: none;
                    visibility: hidden;
                    opacity: 0;
                    color: #f6fbff;
                    background: rgba(4, 9, 21, 0.86);
                    border: 1px solid rgba(126, 214, 255, 0.32);
                    border-radius: 8px;
                    box-shadow: 0 18px 58px rgba(0, 0, 0, 0.48);
                    backdrop-filter: blur(16px);
                    pointer-events: none;
                }
                .reinforcement-panel.is-visible,
                .reinforcement-panel.is-open {
                    display: grid;
                    visibility: visible;
                    opacity: 1;
                }
                .reinforcement-panel.is-open {
                    position: fixed;
                    left: 16px;
                    top: 16px;
                    z-index: 9999;
                    pointer-events: auto;
                }
                .reinforcement-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 10px 12px;
                    border-bottom: 1px solid rgba(126, 214, 255, 0.16);
                    font-weight: 800;
                    font-size: 0.74rem;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }
                .reinforcement-sequence-list {
                    display: grid;
                    gap: 8px;
                    padding: 10px;
                }
                .reinforcement-sequence-card {
                    display: grid;
                    gap: 6px;
                    padding: 9px;
                    border: 1px solid rgba(130, 185, 255, 0.22);
                    border-radius: 8px;
                    background: rgba(11, 19, 38, 0.88);
                    color: #f6fbff;
                }
                .reinforcement-card-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.78rem;
                    font-weight: 800;
                }
                .reinforcement-card-title i { color: #86e7ff; }
                .reinforcement-card-description {
                    color: rgba(230, 243, 255, 0.68);
                    font-size: 0.66rem;
                    line-height: 1.32;
                }
                .reinforcement-arrows {
                    display: flex;
                    gap: 5px;
                    flex-wrap: wrap;
                }
                .reinforcement-arrow {
                    width: 26px;
                    height: 26px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 8px;
                    border: 1px solid rgba(130, 185, 255, 0.28);
                    background: rgba(4, 10, 22, 0.92);
                    color: #edf8ff;
                    font: 800 14px/1 Consolas, monospace;
                }
                .reinforcement-arrow.is-done { color: #071316; background: #8af3d4; }
                .reinforcement-arrow.is-current { border-color: #fff1a8; box-shadow: 0 0 18px rgba(255, 224, 110, 0.32); }
                .reinforcement-arrow.is-error { color: #fff; background: #bd3d55; border-color: #ff8798; }
                .reinforcement-input {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    min-height: 26px;
                    padding: 0 10px 10px;
                }
                .reinforcement-feedback { color: rgba(232, 245, 255, 0.76); font-size: 0.7rem; }
                .reinforcement-feedback.is-error { color: #ff9baa; }
                .reinforcement-reticle {
                    position: fixed;
                    left: 50%;
                    top: 50%;
                    z-index: 33;
                    width: 28px;
                    height: 28px;
                    display: none;
                    transform: translate(-50%, -50%);
                    pointer-events: none;
                }
                .reinforcement-reticle::before,
                .reinforcement-reticle::after {
                    content: '';
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(160, 245, 255, 0.9);
                    box-shadow: 0 0 12px rgba(120, 230, 255, 0.56);
                }
                .reinforcement-reticle::before { width: 28px; height: 2px; }
                .reinforcement-reticle::after { width: 2px; height: 28px; }
                .reinforcement-aim-hint {
                    position: fixed;
                    left: 50%;
                    top: calc(50% + 32px);
                    z-index: 33;
                    display: none;
                    transform: translateX(-50%);
                    padding: 7px 10px;
                    border-radius: 8px;
                    border: 1px solid rgba(130, 220, 255, 0.25);
                    background: rgba(4, 9, 21, 0.82);
                    color: #eefbff;
                    font-size: 0.76rem;
                    font-weight: 700;
                    pointer-events: none;
                    backdrop-filter: blur(12px);
                }
                .reinforcement-reticle.is-visible,
                .reinforcement-aim-hint.is-visible { display: block; }
                body.ui-hidden .reinforcement-panel.is-open,
                body.wallpaper-mode .reinforcement-panel.is-open,
                body.exploration-mode .reinforcement-panel.is-open {
                    display: grid;
                    visibility: visible;
                    opacity: 1;
                }
                @media (max-width: 560px) {
                    .reinforcement-panel {
                        left: 12px;
                        top: 12px;
                        width: min(320px, calc(100vw - 24px));
                    }
                }
            `;
            document.head.appendChild(style);
        }
        this.panel = document.createElement('div');
        this.panel.className = 'reinforcement-panel';
        this.panel.innerHTML = `
            <div class="reinforcement-header">
                <span>Reforcos planetarios</span>
                <span data-reinforcement-status>CTRL</span>
            </div>
            <div class="reinforcement-sequence-list" data-reinforcement-list></div>
            <div class="reinforcement-input">
                <div class="reinforcement-arrows" data-reinforcement-input></div>
                <div class="reinforcement-feedback" data-reinforcement-feedback>Digite uma sequencia.</div>
            </div>
        `;
        this.reticle = document.createElement('div');
        this.reticle.className = 'reinforcement-reticle';
        this.aimHint = document.createElement('div');
        this.aimHint.className = 'reinforcement-aim-hint';
        this.aimHint.textContent = 'Clique para confirmar queda | ESC cancela';
        document.body.appendChild(this.panel);
        document.body.appendChild(this.reticle);
        document.body.appendChild(this.aimHint);
    }

    createMarker() {
        const { THREE } = this;
        this.marker = new THREE.Group();
        const radius = this.getPlanetRadius() * 0.16;
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius, radius * 0.045, 10, 80),
            new THREE.MeshBasicMaterial({ color: 0x71f6ff, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        ring.rotation.x = Math.PI / 2;
        const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.018, radius * 0.018, this.getPlanetRadius() * 0.55, 8, 1, true),
            new THREE.MeshBasicMaterial({ color: 0x71f6ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        pillar.position.y = this.getPlanetRadius() * 0.25;
        this.marker.add(ring, pillar);
        this.marker.visible = false;
        this.surfaceGroup.add(this.marker);
    }

    handleKeyDown(event) {
        if (isEditableTarget(event.target)) return;
        const vehicleSystem = this.getVehicleSystem?.();
        if (vehicleSystem?.hasActiveVehicle?.() || vehicleSystem?.isVehicleModeActive?.()) return;
        const code = event.code || '';
        if ((code === 'ControlLeft' || code === 'ControlRight') && this.canOpenMenu()) {
            if (this.state.phase === 'idle') this.openMenu();
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            return;
        }
        if (this.state.phase === 'sequence') {
            if (code === 'Escape') {
                this.cancel();
            } else if (ARROWS.some((arrow) => arrow.code === code)) {
                this.processSequenceInput(code);
            }
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            return;
        }
        if (this.state.phase === 'aiming_drop' && code === 'Escape') {
            this.cancel();
            this.getExplorationControls()?.markEscapePress?.();
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
        }
    }

    handleKeyUp(event) {
        const code = event.code || '';
        if ((code === 'ControlLeft' || code === 'ControlRight') && this.state.phase === 'sequence') {
            this.cancel();
        }
    }

    handlePointerDown(event) {
        if (this.state.phase !== 'aiming_drop') return;
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (this.currentAimHit) {
            this.confirmDrop(this.currentAimHit.point, this.currentAimHit.normal);
        }
    }

    handleMouseMove(event) {
        if (this.state.phase !== 'aiming_drop') return;
        if (document.pointerLockElement !== this.renderer.domElement) return;
        const vehicleSystem = this.getVehicleSystem?.();
        if (vehicleSystem?.hasActiveVehicle?.() || vehicleSystem?.isVehicleModeActive?.()) return;
        if (this.getExplorationControls()?.isExplorationModeActive?.()) return;
        const sensitivity = 0.0025 * Math.max(0.1, Number(this.getSettings().explorationMouseSensitivity || 1));
        const forward = this.camera.getWorldDirection(this.tmpVecA);
        const right = this.tmpVecB.crossVectors(forward, this.camera.up).normalize();
        forward.applyAxisAngle(this.camera.up, -(event.movementX || 0) * sensitivity);
        forward.applyAxisAngle(right, -(event.movementY || 0) * sensitivity);
        this.camera.lookAt(this.camera.position.clone().add(forward.normalize()));
    }


    canOpenMenu() {
        if (this.isRegenerating()) return false;
        if (this.getSettings().explorationEnabled === false) return false;
        if (!this.getPlanetMesh()?.isMesh) return false;
        const vehicleSystem = this.getVehicleSystem?.();
        if (vehicleSystem?.hasActiveVehicle?.() || vehicleSystem?.isVehicleModeActive?.()) return false;
        return this.state.phase === 'idle';
    }

    openMenu() {
        this.state.phase = 'sequence';
        this.state.menuOpen = true;
        this.state.selectedType = null;
        this.state.inputSequence = [];
        this.state.sequence = [];
        this.state.currentIndex = 0;
        this.state.sequenceStartedAt = performance.now();
        this.state.feedback = 'Digite uma sequencia.';
        this.panel.classList.add('is-visible', 'is-open');
        this.disableChaosTools();
        this.syncPanel();
    }

    closeMenu() {
        if (this.state.phase !== 'sequence') return;
        this.state.phase = 'idle';
        this.state.menuOpen = false;
        this.panel.classList.remove('is-visible', 'is-open');
    }

    selectType(type, start = false) {
        this.state.selectedType = type;
        this.syncPanel();
        if (start) this.beginDropAim();
    }

    startSequence(type) {
        this.state.selectedType = type;
        this.beginDropAim();
    }

    generateSequence(type) {
        return (REINFORCEMENT_SEQUENCES[type] || REINFORCEMENT_SEQUENCES.jeep).map((code) => this.arrowFromCode(code));
    }

    processSequenceInput(code) {
        this.state.inputSequence.push(code);
        const matchedType = this.findExactSequenceMatch(this.state.inputSequence);
        if (matchedType) {
            this.state.selectedType = matchedType;
            this.state.feedback = `${REINFORCEMENT_META[matchedType].title} confirmado. Escolha a queda.`;
            this.syncPanel();
            this.beginDropAim();
            return;
        }

        if (!this.hasSequencePrefix(this.state.inputSequence)) {
            this.state.feedback = 'Sequencia incorreta. Tente de novo.';
            this.markSequenceError();
            window.setTimeout(() => {
                if (this.state.phase !== 'sequence') return;
                this.state.inputSequence = [];
                this.state.feedback = 'Digite uma sequencia.';
                this.syncPanel();
            }, 520);
            return;
        }
        this.syncPanel();
    }

    markSequenceError() {
        this.syncPanel(true);
    }

    beginDropAim() {
        this.state.phase = 'aiming_drop';
        this.panel.classList.remove('is-visible', 'is-open');
        this.reticle.classList.add('is-visible');
        this.aimHint.classList.add('is-visible');
        this.disableChaosTools();
    }

    confirmDrop(worldPoint, normalWorld) {
        const type = this.state.selectedType || 'jeep';
        this.spawnDropPod(type, worldPoint, normalWorld);
        this.state.phase = 'drop_incoming';
        this.reticle.classList.remove('is-visible');
        this.aimHint.classList.remove('is-visible');
        this.marker.visible = false;
        this.currentAimHit = null;
    }

    spawnDropPod(type, worldPoint, normalWorld) {
        const localPoint = worldPoint.clone();
        this.surfaceGroup.worldToLocal(localPoint);
        const localNormal = this.worldDirectionToLocal(normalWorld, this.tmpVecA).normalize();
        const radius = this.getPlanetRadius();
        const travelTime = DROP_MIN_TRAVEL_TIME + Math.random() * (DROP_MAX_TRAVEL_TIME - DROP_MIN_TRAVEL_TIME);
        const start = localPoint.clone().addScaledVector(localNormal, radius * DROP_SPAWN_DISTANCE);
        const group = this.createDropPodModel(type);
        group.position.copy(start);
        this.surfaceGroup.add(group);
        const pod = {
            type,
            group,
            start,
            target: localPoint,
            normal: localNormal.clone(),
            travelTime,
            spin: (Math.random() - 0.5) * 2.4,
            age: 0,
            smokeTimer: 0
        };
        this.dropPods.push(pod);
    }

    createDropPodModel(type) {
        const { THREE } = this;
        const radius = this.getPlanetRadius();
        const scale = radius * (type === 'ship' ? 0.11 : 0.085);
        const group = new THREE.Group();
        const shell = new THREE.Mesh(
            new THREE.CylinderGeometry(scale * 0.34, scale * 0.46, scale * 1.8, 16),
            new THREE.MeshStandardMaterial({ color: 0x627084, roughness: 0.48, metalness: 0.38 })
        );
        const nose = new THREE.Mesh(
            new THREE.ConeGeometry(scale * 0.36, scale * 0.62, 16),
            new THREE.MeshStandardMaterial({ color: 0xc7d4e4, roughness: 0.36, metalness: 0.45 })
        );
        nose.position.y = scale * 1.21;
        const heat = new THREE.Mesh(
            new THREE.ConeGeometry(scale * 0.46, scale * 0.86, 18, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xff8055, transparent: true, opacity: 0.64, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        heat.position.y = -scale * 1.18;
        heat.rotation.x = Math.PI;
        group.add(shell, nose, heat);
        for (let i = 0; i < 4; i++) {
            const panel = new THREE.Mesh(
                new THREE.BoxGeometry(scale * 0.12, scale * 1.1, scale * 0.05),
                new THREE.MeshStandardMaterial({ color: 0x263344, roughness: 0.64, metalness: 0.22 })
            );
            const angle = i * Math.PI * 0.5;
            panel.position.set(Math.cos(angle) * scale * 0.42, 0, Math.sin(angle) * scale * 0.42);
            panel.lookAt(0, panel.position.y, 0);
            group.add(panel);
        }
        group.userData.heat = heat;
        return group;
    }

    update(deltaTime) {
        if (this.isRegenerating()) {
            this.clear();
            return;
        }
        if (this.getSettings().explorationEnabled === false && this.state.phase !== 'idle') {
            this.cancel(true);
            return;
        }
        if (this.state.phase === 'sequence' && performance.now() - this.state.sequenceStartedAt > 8200) {
            this.state.feedback = 'Tempo esgotado.';
            this.cancel(false);
        }
        if (this.state.phase === 'aiming_drop') this.updateAimMarker();
        this.updateDropPods(deltaTime);
        this.updateEffects(deltaTime);
        if (this.state.phase === 'drop_incoming' && this.dropPods.length === 0) {
            this.state.phase = 'idle';
            this.restoreChaosTools();
        }
    }

    updateAimMarker() {
        const hit = this.raycastDropTarget();
        this.currentAimHit = hit;
        this.marker.visible = Boolean(hit);
        if (!hit) return;
        const localPoint = hit.point.clone();
        this.surfaceGroup.worldToLocal(localPoint);
        const localNormal = this.worldDirectionToLocal(hit.normal, this.tmpVecA).normalize();
        this.marker.position.copy(localPoint).addScaledVector(localNormal, this.getPlanetRadius() * 0.015);
        this.alignUp(this.marker, localNormal);
        const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.08;
        this.marker.scale.setScalar(pulse);
    }

    raycastDropTarget() {
        const planet = this.getPlanetMesh();
        if (!planet?.isMesh) return null;
        this.raycaster.setFromCamera(this.ndcCenter, this.camera);
        const hits = this.raycaster.intersectObject(planet, false);
        if (!hits.length) return null;
        const hit = hits[0];
        const normal = hit.face?.normal?.clone?.() || hit.point.clone();
        normal.transformDirection(hit.object.matrixWorld).normalize();
        return { point: hit.point.clone(), normal };
    }

    updateDropPods(deltaTime) {
        for (let i = this.dropPods.length - 1; i >= 0; i--) {
            const pod = this.dropPods[i];
            pod.age += deltaTime;
            pod.smokeTimer += deltaTime;
            const t = clamp(pod.age / Math.max(0.001, pod.travelTime), 0, 1);
            const eased = t * t * (3 - 2 * t);
            pod.group.position.copy(pod.start).lerp(pod.target, eased);
            pod.group.rotation.y += pod.spin * deltaTime;
            this.alignUp(pod.group, pod.normal);
            if (pod.smokeTimer > 0.035) {
                pod.smokeTimer = 0;
                this.spawnSmoke(pod.group.position, pod.normal);
            }
            if (t >= 1) {
                pod.group.position.copy(pod.target);
                this.impactDropPod(pod);
                this.dropPods.splice(i, 1);
            }
        }
    }

    impactDropPod(pod) {
        const worldPoint = pod.target.clone();
        this.surfaceGroup.localToWorld(worldPoint);
        const worldNormal = pod.normal.clone().transformDirection(this.surfaceGroup.matrixWorld).normalize();
        this.spawnExplosion(pod.target, pod.normal, pod.type);
        disposeObject(pod.group);
        const vehicle = this.getVehicleSystem()?.deployVehicle?.(pod.type, worldPoint, worldNormal);
        if (vehicle) {
            vehicle.group.scale.setScalar(0.08);
            vehicle.revealScale = 1;
            this.effects.push({ kind: 'reveal', object: vehicle.group, age: 0, life: 0.42 });
        }
    }

    spawnSmoke(localPosition, normal) {
        const { THREE } = this;
        const radius = this.getPlanetRadius();
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.createGlowTexture('rgba(255,180,120,0.36)', 'rgba(110,120,135,0)'),
            transparent: true,
            opacity: 0.42,
            depthWrite: false
        }));
        sprite.position.copy(localPosition).addScaledVector(normal, radius * 0.04);
        const size = radius * (0.12 + Math.random() * 0.08);
        sprite.scale.set(size, size, 1);
        this.surfaceGroup.add(sprite);
        this.effects.push({
            kind: 'smoke',
            object: sprite,
            velocity: normal.clone().multiplyScalar(radius * 0.22),
            age: 0,
            life: 0.9
        });
    }

    spawnExplosion(localPoint, normal, type) {
        const { THREE } = this;
        const radius = this.getPlanetRadius();
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius * 0.08, radius * 0.01, 10, 80),
            new THREE.MeshBasicMaterial({ color: 0x9ffcff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.copy(localPoint).addScaledVector(normal, radius * 0.04);
        this.alignSurfacePlane(ring, normal);
        this.surfaceGroup.add(ring);
        this.effects.push({ kind: 'shockwave', object: ring, age: 0, life: 0.72, baseScale: type === 'ship' ? 1.4 : 1 });

        for (let i = 0; i < 18; i++) {
            const debris = new THREE.Mesh(
                new THREE.BoxGeometry(radius * 0.025, radius * 0.018, radius * 0.05),
                new THREE.MeshStandardMaterial({ color: i % 2 ? 0x8492a6 : 0xffa45d, roughness: 0.58, metalness: 0.2 })
            );
            const tangent = this.randomTangent(normal, this.tmpVecB).multiplyScalar(radius * (0.7 + Math.random() * 0.8));
            const velocity = tangent.addScaledVector(normal, radius * (0.45 + Math.random() * 0.85));
            debris.position.copy(localPoint).addScaledVector(normal, radius * 0.05);
            debris.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            this.surfaceGroup.add(debris);
            this.effects.push({ kind: 'debris', object: debris, velocity, age: 0, life: 1.2 + Math.random() * 0.7 });
        }
    }

    updateEffects(deltaTime) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.age += deltaTime;
            const t = clamp(effect.age / effect.life, 0, 1);
            if (effect.kind === 'smoke') {
                effect.object.position.addScaledVector(effect.velocity, deltaTime);
                effect.object.material.opacity = (1 - t) * 0.42;
                effect.object.scale.multiplyScalar(1 + deltaTime * 0.55);
            } else if (effect.kind === 'shockwave') {
                const scale = (effect.baseScale || 1) * (1 + t * 5.2);
                effect.object.scale.set(scale, scale, scale);
                effect.object.material.opacity = (1 - t) * 0.9;
            } else if (effect.kind === 'debris') {
                effect.velocity.addScaledVector(effect.object.position.clone().normalize(), -this.getPlanetRadius() * 0.6 * deltaTime);
                effect.object.position.addScaledVector(effect.velocity, deltaTime);
                effect.object.rotation.x += deltaTime * 4.5;
                effect.object.rotation.y += deltaTime * 3.2;
                effect.object.material.opacity = 1 - t;
                effect.object.material.transparent = true;
            } else if (effect.kind === 'reveal') {
                const scale = smoothFactor(13, deltaTime);
                effect.object.scale.lerp(this.tmpVecA.setScalar(1), scale);
            }
            if (effect.age >= effect.life) {
                if (effect.kind !== 'reveal') disposeObject(effect.object);
                else effect.object.scale.setScalar(1);
                this.effects.splice(i, 1);
            }
        }
    }

    syncPanel(error = false) {
        this.panel.querySelector('[data-reinforcement-status]').textContent = this.state.phase === 'sequence' ? 'SETAS' : 'MIRA';
        const list = this.panel.querySelector('[data-reinforcement-list]');
        list.innerHTML = Object.entries(REINFORCEMENT_SEQUENCES).map(([type, sequence]) => {
            const meta = REINFORCEMENT_META[type];
            const arrows = sequence.map((code, index) => {
                const item = this.arrowFromCode(code);
                const matchesInput = this.state.inputSequence[index] === code;
                const classes = ['reinforcement-arrow'];
                if (matchesInput) classes.push('is-done');
                return `<span class="${classes.join(' ')}">${item.symbol}</span>`;
            }).join('');
            return `
                <div class="reinforcement-sequence-card">
                    <div class="reinforcement-card-title"><i class="fas ${meta.icon}"></i><span>${meta.title}</span></div>
                    <div class="reinforcement-arrows">${arrows}</div>
                    <div class="reinforcement-card-description">${meta.description}</div>
                </div>
            `;
        }).join('');

        const input = this.panel.querySelector('[data-reinforcement-input]');
        input.innerHTML = this.state.inputSequence.map((code, index) => {
            const item = this.arrowFromCode(code);
            const classes = ['reinforcement-arrow'];
            if (error && index === this.state.inputSequence.length - 1) classes.push('is-error');
            else classes.push('is-current');
            return `<span class="${classes.join(' ')}">${item.symbol}</span>`;
        }).join('');

        const feedback = this.panel.querySelector('[data-reinforcement-feedback]');
        feedback.textContent = this.state.feedback || 'Digite uma sequencia.';
        feedback.classList.toggle('is-error', Boolean(error));
    }

    arrowFromCode(code) {
        return ARROWS.find((arrow) => arrow.code === code) || { code, symbol: '?' };
    }

    findExactSequenceMatch(input) {
        return Object.entries(REINFORCEMENT_SEQUENCES).find(([, sequence]) => {
            return sequence.length === input.length && sequence.every((code, index) => code === input[index]);
        })?.[0] || null;
    }

    hasSequencePrefix(input) {
        return Object.values(REINFORCEMENT_SEQUENCES).some((sequence) => {
            if (input.length > sequence.length) return false;
            return input.every((code, index) => code === sequence[index]);
        });
    }

    cancel(restoreTools = true) {
        this.state.phase = 'idle';
        this.state.menuOpen = false;
        this.state.currentIndex = 0;
        this.state.sequence = [];
        this.state.inputSequence = [];
        this.panel.classList.remove('is-visible', 'is-open');
        this.reticle.classList.remove('is-visible');
        this.aimHint.classList.remove('is-visible');
        this.marker.visible = false;
        this.currentAimHit = null;
        if (restoreTools) this.restoreChaosTools();
    }

    disableChaosTools() {
        const toolbar = this.getChaosToolbar();
        if (!toolbar?.setToolsEnabled) return;
        if (this.savedChaosToolsEnabled === null) this.savedChaosToolsEnabled = toolbar.getState?.().toolsEnabled ?? toolbar.isToolsEnabled?.();
        toolbar.setToolsEnabled(false);
    }

    restoreChaosTools() {
        const toolbar = this.getChaosToolbar();
        if (toolbar?.setToolsEnabled && this.savedChaosToolsEnabled !== null) {
            toolbar.setToolsEnabled(this.savedChaosToolsEnabled);
        }
        this.savedChaosToolsEnabled = null;
    }

    alignUp(object, up) {
        object.quaternion.setFromUnitVectors(new this.THREE.Vector3(0, 1, 0), up.clone().normalize());
    }

    alignSurfacePlane(object, normal) {
        object.quaternion.setFromUnitVectors(new this.THREE.Vector3(0, 0, 1), normal.clone().normalize());
    }

    randomTangent(normal, target) {
        target.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        target.addScaledVector(normal, -target.dot(normal));
        if (target.lengthSq() < 0.0001) target.set(1, 0, 0).addScaledVector(normal, -normal.x);
        return target.normalize();
    }

    worldDirectionToLocal(direction, target) {
        this.tmpMatrix.copy(this.surfaceGroup.matrixWorld).invert();
        return target.copy(direction).transformDirection(this.tmpMatrix).normalize();
    }

    createGlowTexture(inner, outer) {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, inner);
        gradient.addColorStop(1, outer);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        const texture = new this.THREE.CanvasTexture(canvas);
        texture.minFilter = this.THREE.LinearFilter;
        texture.magFilter = this.THREE.LinearFilter;
        return texture;
    }

    isCameraInteractionActive() {
        return this.state.phase === 'drop_incoming';
    }

    isSequenceInputActive() {
        return this.state.phase === 'sequence';
    }

    isAimingDrop() {
        return this.state.phase === 'aiming_drop';
    }

    clear() {
        this.cancel(true);
        this.dropPods.forEach((pod) => disposeObject(pod.group));
        this.dropPods.length = 0;
        this.effects.forEach((effect) => {
            if (effect.kind !== 'reveal') disposeObject(effect.object);
        });
        this.effects.length = 0;
        if (this.marker) {
            this.marker.visible = false;
            if (!this.marker.parent) this.surfaceGroup.add(this.marker);
        }
    }

    reattachMarker() {
        if (!this.marker) return;
        this.marker.visible = false;
        if (this.marker.parent !== this.surfaceGroup) this.surfaceGroup.add(this.marker);
    }

    dispose() {
        this.clear();
        window.removeEventListener('keydown', this.onKeyDown, true);
        window.removeEventListener('keyup', this.onKeyUp, true);
        document.removeEventListener('mousemove', this.onMouseMove);
        this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown, true);
        this.panel?.remove();
        this.reticle?.remove();
        this.aimHint?.remove();
        disposeObject(this.marker);
    }
}
