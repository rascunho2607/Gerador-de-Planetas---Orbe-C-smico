export const ControlMode = {
    ORBIT: 'orbit',
    PLANET_FPS: 'planet_fps',
    DINO_THIRD_PERSON: 'dino_third_person'
};

const TRIPLE_CLICK_WINDOW_MS = 650;
const TRIPLE_CLICK_MAX_SCREEN_DISTANCE = 24;
const DINO_SCREEN_FALLBACK_DISTANCE = 46;
const CLICK_DRAG_CANCEL_DISTANCE = 8;
const CLICK_MAX_DURATION_MS = 420;
const MAX_PITCH = Math.PI * 0.44;
const DINO_MAX_PITCH_DOWN = Math.PI * 0.76;
const FPS_FOV_MIN = 35;
const FPS_FOV_MAX = 115;
const FPS_FOV_STEP = 2;
const DINO_DISTANCE_MIN = 0.45;
const DINO_DISTANCE_MAX = 2.4;
const DINO_DISTANCE_STEP = 0.08;
const EPSILON = 0.000001;

const CAMERA_DISTANCE_PRESETS = {
    near: { dinoDistance: 3.3, dinoHeight: 1.45 },
    medium: { dinoDistance: 5.2, dinoHeight: 2.1 },
    far: { dinoDistance: 7.2, dinoHeight: 3.0 }
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function smoothFactor(speed, deltaTime) {
    return 1 - Math.exp(-Math.max(0.001, speed) * Math.max(0, deltaTime || 0));
}

function screenDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function isEditableTarget(target) {
    return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

function isUiTarget(target) {
    return Boolean(target?.closest?.([
        '.ui',
        '.info-panel',
        '.editor-panel',
        '.settings-panel',
        '.planet-chaos-shell',
        '.planet-chaos-handle',
        '.planet-exploration-hud',
        'button',
        'input',
        'textarea',
        'select',
        'details'
    ].join(',')));
}

function normalizeInputKey(event) {
    const code = event.code || '';
    if (code === 'KeyW' || code === 'ArrowUp') return 'w';
    if (code === 'KeyA' || code === 'ArrowLeft') return 'a';
    if (code === 'KeyS' || code === 'ArrowDown') return 's';
    if (code === 'KeyD' || code === 'ArrowRight') return 'd';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'shift';
    if (code === 'Space') return ' ';
    const key = String(event.key || '').toLowerCase();
    if (key === 'spacebar') return ' ';
    return key;
}

export class PlanetExplorationControls {
    constructor(options = {}) {
        this.THREE = options.THREE;
        this.scene = options.scene;
        this.camera = options.camera;
        this.renderer = options.renderer;
        this.controls = options.controls;
        this.surfaceGroup = options.surfaceGroup || this.scene;
        this.getPlanetMesh = options.getPlanetMesh || (() => null);
        this.getPlanetRadius = options.getPlanetRadius || (() => 1);
        this.getPlanetCenter = options.getPlanetCenter || (() => new this.THREE.Vector3());
        this.getPlanetSurfaceHeight = options.getPlanetSurfaceHeight || (() => 0);
        this.getDinoSystem = options.getDinoSystem || (() => null);
        this.getChaosToolbar = options.getChaosToolbar || (() => null);
        this.getSettings = options.getSettings || (() => ({}));
        this.isRegenerating = options.isRegenerating || (() => false);
        this.onModeChange = options.onModeChange || (() => {});

        this.mode = ControlMode.ORBIT;
        this.previousCameraState = null;
        this.isExitingMode = false;
        this.ignoreNextPointerUnlock = false;

        this.raycaster = new this.THREE.Raycaster();
        this.pointer = new this.THREE.Vector2();
        this.keys = new Set();
        this.clickSequence = [];
        this.pendingPointer = null;

        this.tmpVecA = new this.THREE.Vector3();
        this.tmpVecB = new this.THREE.Vector3();
        this.tmpVecC = new this.THREE.Vector3();
        this.tmpVecD = new this.THREE.Vector3();
        this.tmpMatrix = new this.THREE.Matrix4();

        this.fpsState = this.createSurfaceState();
        this.dinoState = this.createSurfaceState();
        this.controlledDino = null;
        this.pointerLockElement = this.renderer?.domElement || null;
        this.pointerLockElement?.setAttribute?.('tabindex', '0');

        this.dinoCameraDistanceScale = 1;
        this.hud = this.createHud();
        this.bindEvents();
    }

    createSurfaceState() {
        return {
            normal: new this.THREE.Vector3(0, 1, 0),
            heading: new this.THREE.Vector3(0, 0, 1),
            facing: new this.THREE.Vector3(0, 0, 1),
            velocity: new this.THREE.Vector3(),
            verticalOffset: 0,
            verticalVelocity: 0,
            grounded: true,
            wasGrounded: true,
            pitch: 0,
            bobTimer: 0,
            bobSide: 0,
            bobUp: 0,
            landingDip: 0
        };
    }

    bindEvents() {
        this.onPointerDown = (event) => this.handlePointerDown(event);
        this.onPointerMove = (event) => this.handlePointerMove(event);
        this.onPointerUp = (event) => this.handlePointerUp(event);
        this.onMouseMove = (event) => this.handleMouseMove(event);
        this.onPointerLockChange = () => this.handlePointerLockChange();
        this.onPointerLockError = () => this.handlePointerLockError();
        this.onKeyDown = (event) => this.handleKeyDown(event);
        this.onKeyUp = (event) => this.handleKeyUp(event);
        this.onWheel = (event) => this.handleWheel(event);
        this.onBlur = () => this.keys.clear();

        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
        document.addEventListener('pointerlockerror', this.onPointerLockError);
        window.addEventListener('keydown', this.onKeyDown, true);
        window.addEventListener('keyup', this.onKeyUp, true);
        window.addEventListener('wheel', this.onWheel, { passive: false });
        window.addEventListener('blur', this.onBlur);
    }

    createHud() {
        if (!document.getElementById('planetExplorationStyles')) {
            const style = document.createElement('style');
            style.id = 'planetExplorationStyles';
            style.textContent = `
                .planet-exploration-hud {
                    position: fixed;
                    left: 50%;
                    top: 18px;
                    z-index: 29;
                    min-width: min(470px, calc(100vw - 28px));
                    display: none;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 10px 12px;
                    color: #f7fbff;
                    background: rgba(4, 8, 20, 0.82);
                    border: 1px solid rgba(124, 175, 255, 0.32);
                    border-radius: 8px;
                    box-shadow: 0 14px 46px rgba(0, 0, 0, 0.45);
                    backdrop-filter: blur(16px);
                    transform: translateX(-50%);
                    pointer-events: auto;
                }

                .planet-exploration-hud.is-visible {
                    display: flex;
                }

                .planet-exploration-status {
                    display: grid;
                    gap: 2px;
                    min-width: 0;
                }

                .planet-exploration-status strong {
                    font-size: 0.78rem;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                }

                .planet-exploration-status span {
                    color: rgba(232, 241, 255, 0.72);
                    font-size: 0.68rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .planet-exploration-exit {
                    width: auto;
                    height: 38px;
                    min-width: 38px;
                    padding: 0 12px;
                    gap: 8px;
                    justify-content: center;
                    border-radius: 8px;
                    font-size: 0.76rem;
                }

                body.ui-hidden .planet-exploration-hud,
                body.wallpaper-mode .planet-exploration-hud {
                    display: none;
                }

                @media (max-width: 600px) {
                    .planet-exploration-hud {
                        top: 12px;
                        min-width: calc(100vw - 24px);
                    }

                    .planet-exploration-status span {
                        white-space: normal;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        const hud = document.createElement('div');
        hud.className = 'planet-exploration-hud';
        hud.innerHTML = `
            <div class="planet-exploration-status">
                <strong data-exploration-title>Modo primeira pessoa</strong>
                <span data-exploration-hint>WASD mover, Shift correr, Espaco pular, ESC sair</span>
            </div>
            <button class="planet-exploration-exit" type="button" title="Sair da exploracao" aria-label="Sair da exploracao">
                <i class="fas fa-sign-out-alt"></i><span>Sair</span>
            </button>
        `;
        hud.querySelector('button')?.addEventListener('click', () => this.exitExplorationMode());
        document.body.appendChild(hud);
        return hud;
    }

    handlePointerDown(event) {
        if (event.button !== 0 || isUiTarget(event.target)) return;
        if (this.isExplorationModeActive()) {
            this.requestPointerLock();
            event.preventDefault();
            return;
        }

        this.pendingPointer = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            time: performance.now(),
            moved: false
        };
    }

    handlePointerMove(event) {
        if (!this.pendingPointer || this.pendingPointer.pointerId !== event.pointerId) return;
        const distance = screenDistance(this.pendingPointer, { x: event.clientX, y: event.clientY });
        if (distance > CLICK_DRAG_CANCEL_DISTANCE) this.pendingPointer.moved = true;
    }

    handlePointerUp(event) {
        const pending = this.pendingPointer;
        this.pendingPointer = null;
        if (!pending || pending.pointerId !== event.pointerId || event.button !== 0) return;
        if (pending.moved || performance.now() - pending.time > CLICK_MAX_DURATION_MS) {
            this.resetClickSequence();
            return;
        }
        this.processExplorationClick(event);
    }

    handleMouseMove(event) {
        if (!this.isExplorationModeActive()) return;
        if (document.pointerLockElement !== this.pointerLockElement) return;
        this.rotatePointerLockedView(event.movementX || 0, event.movementY || 0);
    }

    handlePointerLockChange() {
        const locked = document.pointerLockElement === this.pointerLockElement;
        if (locked || !this.isExplorationModeActive()) return;
        if (this.ignoreNextPointerUnlock) {
            this.ignoreNextPointerUnlock = false;
            return;
        }
        if (!this.isExitingMode) this.exitExplorationMode({ skipPointerUnlock: true });
    }

    handlePointerLockError() {
        if (this.isExplorationModeActive()) {
            this.updateHudForMode();
        }
    }

    handleWheel(event) {
        if (!this.isExplorationModeActive() || isUiTarget(event.target) || isEditableTarget(event.target)) return;
        event.preventDefault();

        if (this.mode === ControlMode.DINO_THIRD_PERSON) {
            const delta = Math.sign(event.deltaY || 0);
            this.dinoCameraDistanceScale = clamp(
                this.dinoCameraDistanceScale + delta * DINO_DISTANCE_STEP,
                DINO_DISTANCE_MIN,
                DINO_DISTANCE_MAX
            );
            return;
        }

        if (this.mode === ControlMode.PLANET_FPS) {
            const fovChange = Math.sign(event.deltaY || 0) * FPS_FOV_STEP;
            this.camera.fov = clamp(this.camera.fov + fovChange, FPS_FOV_MIN, FPS_FOV_MAX);
            this.camera.updateProjectionMatrix();
        }
    }

    handleKeyDown(event) {
        const key = normalizeInputKey(event);
        if (key === 'escape' && this.isExplorationModeActive()) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            this.exitExplorationMode();
            return;
        }

        if (!this.isExplorationModeActive() || isEditableTarget(event.target)) return;
        if (['w', 'a', 's', 'd', 'shift', ' '].includes(key)) {
            this.keys.add(key);
            event.preventDefault();
            event.stopPropagation();
        }
    }

    handleKeyUp(event) {
        this.keys.delete(normalizeInputKey(event));
    }

    rotatePointerLockedView(movementX, movementY) {
        const settings = this.getSettings();
        const sensitivity = 0.0028 * Math.max(0.1, Number(settings.explorationMouseSensitivity || 1));
        const state = this.mode === ControlMode.DINO_THIRD_PERSON ? this.dinoState : this.fpsState;
        state.heading.applyAxisAngle(state.normal, -movementX * sensitivity);
        this.projectOntoTangent(state.heading, state.normal, state.facing);
        state.facing.copy(state.heading);
        const minPitch = this.mode === ControlMode.DINO_THIRD_PERSON ? -DINO_MAX_PITCH_DOWN : -MAX_PITCH;
        const mouseY = this.mode === ControlMode.DINO_THIRD_PERSON ? movementY : -movementY;
        state.pitch = clamp(state.pitch + mouseY * sensitivity, minPitch, MAX_PITCH);
    }

    processExplorationClick(event) {
        if (!this.canProcessExplorationClick(event)) {
            this.resetClickSequence();
            return;
        }

        const hit = this.raycastExplorationTarget(event);
        if (!hit) {
            this.resetClickSequence();
            return;
        }

        if (hit.type === 'dino' && hit.dino) {
            this.processDinoTripleClick(hit, event);
            return;
        }

        if (hit.type === 'planet') {
            this.processPlanetTripleClick(hit, event);
        }
    }

    processPlanetTripleClick(hit, event) {
        const now = performance.now();
        const point = { x: event.clientX, y: event.clientY };
        const targetKey = 'planet';
        const first = this.clickSequence[0];

        if (
            !first ||
            now - first.time > TRIPLE_CLICK_WINDOW_MS ||
            first.targetKey !== targetKey ||
            screenDistance(first, point) > TRIPLE_CLICK_MAX_SCREEN_DISTANCE
        ) {
            this.clickSequence = [{ ...point, time: now, targetKey, hit }];
            return;
        }

        this.clickSequence.push({ ...point, time: now, targetKey, hit });
        if (this.clickSequence.length < 3) return;

        this.resetClickSequence();
        this.enterPlanetFirstPersonMode(hit.point);
    }

    processDinoTripleClick(hit, event) {
        const now = performance.now();
        const point = { x: event.clientX, y: event.clientY };
        const targetKey = `dino:${hit.dino?.group?.uuid || hit.dino?.index}`;
        const first = this.clickSequence[0];

        if (
            !first ||
            now - first.time > TRIPLE_CLICK_WINDOW_MS ||
            first.targetKey !== targetKey ||
            screenDistance(first, point) > TRIPLE_CLICK_MAX_SCREEN_DISTANCE
        ) {
            this.clickSequence = [{ ...point, time: now, targetKey, hit }];
            return;
        }

        this.clickSequence.push({ ...point, time: now, targetKey, hit });
        if (this.clickSequence.length < 3) return;

        this.resetClickSequence();
        this.enterDinoThirdPersonMode(hit.dino);
    }

    canProcessExplorationClick(event) {
        const settings = this.getSettings();
        if (settings.explorationEnabled === false) return false;
        if (this.mode !== ControlMode.ORBIT) return false;
        if (this.isRegenerating()) return false;
        if (isUiTarget(event.target)) return false;
        if (this.getChaosToolbar()?.isToolsEnabled?.()) return false;
        return Boolean(this.getPlanetMesh()?.isMesh);
    }

    raycastExplorationTarget(event) {
        this.pointerToNdc(event);
        this.raycaster.setFromCamera(this.pointer, this.camera);

        const dinoSystem = this.getDinoSystem();
        const dinoObjects = dinoSystem?.getInteractiveDinoObjects?.() || [];
        const dinoHits = dinoObjects.length ? this.raycaster.intersectObjects(dinoObjects, true) : [];
        const planet = this.getPlanetMesh();
        const planetHits = planet?.isMesh ? this.raycaster.intersectObject(planet, false) : [];
        const planetHit = planetHits[0] || null;

        for (const hit of dinoHits) {
            const dino = dinoSystem?.getDinoFromObject?.(hit.object);
            if (!dino) continue;
            if (planetHit && hit.distance > planetHit.distance + 0.24) continue;
            return { type: 'dino', dino, point: hit.point.clone(), hit };
        }

        const screenDinoHit = this.findNearestScreenDino(event, dinoSystem, planetHit);
        if (screenDinoHit) return screenDinoHit;

        if (planetHit) {
            return {
                type: 'planet',
                point: planetHit.point.clone(),
                normalWorld: this.getHitNormal(planetHit),
                hit: planetHit
            };
        }

        return null;
    }

    findNearestScreenDino(event, dinoSystem, planetHit) {
        const dinos = dinoSystem?.population;
        if (!Array.isArray(dinos) || !dinos.length) return null;

        const rect = this.renderer.domElement.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        let best = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        this.camera.updateMatrixWorld();
        for (const dino of dinos) {
            if (dinoSystem.isDinoInteractive?.(dino) === false) continue;
            if (!dino?.group?.visible || !dino.group.getWorldPosition) continue;

            const worldPosition = this.tmpVecA;
            dino.group.getWorldPosition(worldPosition);
            const cameraDistance = worldPosition.distanceTo(this.camera.position);
            const clearance = Math.max(0.75, this.getDinoVisualScale(dino) * 1.8);
            if (planetHit && cameraDistance > planetHit.distance + clearance) continue;

            const projected = this.tmpVecB.copy(worldPosition).project(this.camera);
            if (projected.z < -1 || projected.z > 1) continue;

            const screenX = (projected.x * 0.5 + 0.5) * rect.width;
            const screenY = (-projected.y * 0.5 + 0.5) * rect.height;
            const distance = Math.hypot(pointerX - screenX, pointerY - screenY);
            const visualScale = Math.max(0.35, this.getDinoVisualScale(dino));
            const threshold = Math.min(82, DINO_SCREEN_FALLBACK_DISTANCE + visualScale * 10);
            if (distance <= threshold && distance < bestDistance) {
                bestDistance = distance;
                best = dino;
            }
        }

        if (!best) return null;
        const point = this.tmpVecA;
        best.group.getWorldPosition(point);
        return {
            type: 'dino',
            dino: best,
            point: point.clone(),
            hit: null,
            screenFallback: true
        };
    }

    pointerToNdc(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        this.pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    }

    getHitNormal(hit) {
        if (hit.face?.normal) {
            const normalMatrix = new this.THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
            return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        }
        return hit.point.clone().sub(this.getWorldPlanetCenter()).normalize();
    }

    resetClickSequence() {
        this.clickSequence.length = 0;
    }

    saveOrbitCameraState() {
        if (this.previousCameraState) return;
        this.previousCameraState = {
            position: this.camera.position.clone(),
            quaternion: this.camera.quaternion.clone(),
            up: this.camera.up.clone(),
            fov: this.camera.fov,
            near: this.camera.near,
            far: this.camera.far,
            zoom: this.camera.zoom,
            orbitEnabled: this.controls?.enabled ?? true,
            orbitTarget: this.controls?.target?.clone?.() || this.getWorldPlanetCenter()
        };
    }

    restoreOrbitCameraState() {
        const state = this.previousCameraState;
        if (state) {
            this.camera.position.copy(state.position);
            this.camera.quaternion.copy(state.quaternion);
            this.camera.up.copy(state.up);
            this.camera.fov = state.fov;
            this.camera.near = state.near;
            this.camera.far = state.far;
            this.camera.zoom = state.zoom;
            this.camera.updateProjectionMatrix();
            if (this.controls) {
                this.controls.target.copy(state.orbitTarget);
                this.controls.enabled = state.orbitEnabled;
                this.controls.update();
                this.controls.enabled = true;
            }
            this.previousCameraState = null;
            return;
        }

        this.camera.up.set(0, 1, 0);
        this.camera.updateProjectionMatrix();
        if (this.controls) {
            this.controls.enabled = true;
            this.controls.target.copy(this.getWorldPlanetCenter());
            this.controls.update();
        }
    }

    enterSharedMode(title, hint) {
        this.saveOrbitCameraState();
        if (this.controls) this.controls.enabled = false;
        this.pendingPointer = null;
        this.resetClickSequence();
        this.keys.clear();
        this.updateHud(title, hint);
        this.pointerLockElement?.focus?.({ preventScroll: true });
        this.requestPointerLock();
        this.onModeChange(this.mode);
    }

    enterPlanetFirstPersonMode(hitPoint) {
        if (!hitPoint || this.getSettings().explorationEnabled === false) return;
        if (this.isExplorationModeActive()) this.exitExplorationMode({ silent: true });

        const state = this.fpsState;
        this.resetSurfaceState(state);
        this.normalFromWorldPoint(hitPoint, state.normal);
        this.cameraForwardOnSurface(state.normal, state.heading);
        state.facing.copy(state.heading);
        state.pitch = 0;
        this.mode = ControlMode.PLANET_FPS;
        this.enterSharedMode(
            'Modo primeira pessoa',
            'WASD mover, Shift correr, Espaco pular, ESC sair'
        );
        this.updatePlanetFpsCamera(0, true);
    }

    enterPlanetWalkMode(hitPoint) {
        this.enterPlanetFirstPersonMode(hitPoint);
    }

    enterWalkMode(hitPoint) {
        this.enterPlanetFirstPersonMode(hitPoint);
    }

    exitPlanetWalkMode() {
        this.exitExplorationMode();
    }

    enterDinoThirdPersonMode(dino) {
        if (!dino || this.getSettings().explorationEnabled === false) return;
        if (this.isExplorationModeActive()) this.exitExplorationMode({ silent: true });

        const dinoSystem = this.getDinoSystem();
        if (!dinoSystem?.setDinoControlled?.(dino, true)) return;

        const state = this.dinoState;
        this.resetSurfaceState(state);
        state.normal.copy(dino.normal).normalize();
        state.heading.copy(dino.tangent);
        this.projectOntoTangent(state.heading, state.normal, this.tangentFromNormal(state.normal));
        state.facing.copy(state.heading);
        state.pitch = 0.18;

        this.mode = ControlMode.DINO_THIRD_PERSON;
        this.controlledDino = dino;
        dino.tangent.copy(state.facing);
        dino.state = 'idle';
        dino.animation?.setAnimation?.('idle', dinoSystem.getSpriteDirection?.(dino) || 'S');
        dinoSystem.placeDino?.(dino);
        this.enterSharedMode(
            'Controlando dino',
            'WASD mover, Shift correr, mouse olhar, ESC sair'
        );
        this.updateDinoThirdPersonCamera(0, true);
    }

    enterDinoControlMode(dino) {
        this.enterDinoThirdPersonMode(dino);
    }

    resetSurfaceState(state) {
        state.velocity.set(0, 0, 0);
        state.verticalOffset = 0;
        state.verticalVelocity = 0;
        state.grounded = true;
        state.wasGrounded = true;
        state.pitch = 0;
        state.bobTimer = 0;
        state.bobSide = 0;
        state.bobUp = 0;
        state.landingDip = 0;
    }

    exitExplorationMode(options = {}) {
        const previousMode = this.mode;
        if (previousMode === ControlMode.ORBIT && !this.previousCameraState) {
            this.cleanupInputState();
            return;
        }

        this.isExitingMode = true;
        if (!options.skipPointerUnlock) this.exitPointerLock();

        if (this.controlledDino) {
            this.getDinoSystem()?.setDinoControlled?.(this.controlledDino, false);
            this.controlledDino = null;
        }

        this.mode = ControlMode.ORBIT;
        this.cleanupInputState();
        this.restoreOrbitCameraState();
        this.hud.classList.remove('is-visible');
        this.isExitingMode = false;

        if (!options.silent && previousMode !== ControlMode.ORBIT) {
            this.onModeChange(this.mode);
        }
    }

    cleanupInputState() {
        this.pendingPointer = null;
        this.keys.clear();
        this.resetClickSequence();
        this.resetSurfaceState(this.fpsState);
        this.resetSurfaceState(this.dinoState);
    }

    requestPointerLock() {
        if (!this.pointerLockElement || document.pointerLockElement === this.pointerLockElement) return;
        try {
            this.pointerLockElement.requestPointerLock?.();
        } catch (error) {
            console.warn('Nao foi possivel ativar Pointer Lock na exploracao.', error);
        }
    }

    exitPointerLock() {
        if (document.pointerLockElement !== this.pointerLockElement) return;
        this.ignoreNextPointerUnlock = true;
        try {
            document.exitPointerLock?.();
        } catch (error) {
            this.ignoreNextPointerUnlock = false;
            console.warn('Nao foi possivel sair do Pointer Lock da exploracao.', error);
        }
    }

    updateExplorationControls(deltaTime) {
        if (!this.isExplorationModeActive()) return;
        if (this.isRegenerating() || this.getSettings().explorationEnabled === false) {
            this.exitExplorationMode();
            return;
        }
        if (this.getChaosToolbar()?.isToolsEnabled?.()) {
            this.exitExplorationMode();
            return;
        }
        if (this.controls) this.controls.enabled = false;

        if (this.mode === ControlMode.PLANET_FPS) {
            this.updatePlanetFpsMode(deltaTime);
        } else if (this.mode === ControlMode.DINO_THIRD_PERSON) {
            this.updateDinoThirdPersonMode(deltaTime);
        }
    }

    update(deltaTime) {
        this.updateExplorationControls(deltaTime);
    }

    updatePlanetFpsMode(deltaTime) {
        const state = this.fpsState;
        const moving = this.updateSurfaceMovement(state, deltaTime, this.getPlanetMoveSpeed(), true);
        this.updateHeadBob(state, deltaTime, moving);
        this.updatePlanetFpsCamera(deltaTime);
    }

    updateDinoThirdPersonMode(deltaTime) {
        const dino = this.controlledDino;
        const dinoSystem = this.getDinoSystem();
        if (!this.isDinoAvailable(dino)) {
            this.exitExplorationMode();
            return;
        }

        const state = this.dinoState;
        state.normal.copy(dino.normal).normalize();
        this.projectOntoTangent(state.heading, state.normal, dino.tangent);
        const moving = this.updateSurfaceMovement(state, deltaTime, this.getDinoMoveSpeed(dino), false);
        dino.normal.copy(state.normal);
        dino.tangent.copy(state.facing);
        dino.state = moving ? (this.keys.has('shift') ? 'run' : 'walk') : 'idle';
        dino.group.visible = true;
        dinoSystem.placeDino?.(dino);

        const direction = dinoSystem.getSpriteDirection?.(dino) || dino.animation?.direction || 'S';
        if (dino.animation && (dino.animation.animation !== dino.state || dino.animation.direction !== direction)) {
            dino.animation.setAnimation(dino.state, direction);
        }
        if (this.getSettings().dinoAnimationEnabled !== false) {
            dino.animation?.update?.(deltaTime, direction);
        }

        this.updateDinoThirdPersonCamera(deltaTime);
    }

    updateSurfaceMovement(state, deltaTime, speed, allowJump) {
        const input = this.getMoveInput();
        const right = this.getRightFromHeading(state.heading, state.normal, this.tmpVecA);
        const move = this.tmpVecB.set(0, 0, 0)
            .addScaledVector(state.heading, input.forward)
            .addScaledVector(right, input.right);

        const hasMovement = move.lengthSq() > EPSILON;
        if (hasMovement) move.normalize();

        const targetVelocity = this.tmpVecC.copy(move).multiplyScalar(speed);
        const accel = hasMovement ? 11.5 : 8.4;
        state.velocity.lerp(targetVelocity, smoothFactor(accel, deltaTime));
        this.flattenToTangent(state.velocity, state.normal);
        if (state.velocity.lengthSq() < EPSILON) state.velocity.set(0, 0, 0);

        const velocityLength = state.velocity.length();
        if (velocityLength > 0.002) {
            const airControl = state.grounded ? 1 : 0.42;
            const effectiveRadius = Math.max(0.5, this.getPlanetRadius() + this.getSurfaceHeight(state.normal));
            state.normal.addScaledVector(state.velocity, (deltaTime * airControl) / effectiveRadius).normalize();
            this.projectOntoTangent(state.heading, state.normal, this.tangentFromNormal(state.normal));
            state.facing.lerp(state.velocity, smoothFactor(12, deltaTime));
            this.projectOntoTangent(state.facing, state.normal, state.heading);
        } else {
            this.projectOntoTangent(state.heading, state.normal, this.tangentFromNormal(state.normal));
            state.facing.lerp(state.heading, smoothFactor(5.2, deltaTime));
            this.projectOntoTangent(state.facing, state.normal, state.heading);
        }

        if (allowJump) this.updateJump(state, deltaTime);
        return hasMovement || velocityLength > 0.05;
    }

    updateJump(state, deltaTime) {
        state.wasGrounded = state.grounded;
        if (this.keys.has(' ') && state.grounded) {
            state.verticalVelocity = this.getPlanetRadius() * 0.34 * Math.max(0.4, Number(this.getSettings().explorationJumpStrength || 1));
            state.grounded = false;
        }

        if (state.grounded && state.verticalOffset <= 0) return;
        state.verticalVelocity -= this.getPlanetRadius() * 1.95 * deltaTime;
        state.verticalOffset += state.verticalVelocity * deltaTime;
        if (state.verticalOffset <= 0) {
            state.verticalOffset = 0;
            state.verticalVelocity = 0;
            state.grounded = true;
            if (!state.wasGrounded) {
                state.landingDip = -this.getPlanetRadius() * 0.006 * this.getHeadBobIntensity();
            }
        }
    }

    updateHeadBob(state, deltaTime, moving) {
        if (this.getSettings().explorationHeadBobEnabled === false) {
            state.bobSide = 0;
            state.bobUp = 0;
            state.landingDip = 0;
            return;
        }

        const intensity = this.getHeadBobIntensity();
        const speedRatio = clamp(state.velocity.length() / Math.max(0.001, this.getPlanetRunSpeed()), 0, 1);
        const running = this.keys.has('shift');
        if (moving && state.grounded) {
            const frequency = running ? 12.5 : 8.2;
            state.bobTimer += deltaTime * frequency * (0.35 + speedRatio);
            const amp = this.getPlanetRadius() * 0.0048 * intensity * (running ? 1.45 : 1);
            state.bobUp = Math.abs(Math.sin(state.bobTimer)) * amp;
            state.bobSide = Math.sin(state.bobTimer * 0.5) * amp * 0.42;
        } else {
            state.bobUp *= smoothFactor(10, deltaTime) < 1 ? Math.exp(-10 * deltaTime) : 0;
            state.bobSide *= smoothFactor(10, deltaTime) < 1 ? Math.exp(-10 * deltaTime) : 0;
        }
        state.landingDip *= Math.exp(-13 * deltaTime);
    }

    updatePlanetFpsCamera(deltaTime, instant = false) {
        const state = this.fpsState;
        const right = this.getRightFromHeading(state.heading, state.normal, this.tmpVecA);
        const localPosition = this.getSurfacePositionLocal(
            state.normal,
            this.getEyeHeight() + state.verticalOffset + state.bobUp + state.landingDip,
            0
        ).addScaledVector(right, state.bobSide);
        const worldPosition = localPosition.clone();
        this.surfaceGroup.localToWorld(worldPosition);

        const forwardLocal = this.tmpVecB.copy(state.heading)
            .multiplyScalar(Math.cos(state.pitch))
            .addScaledVector(state.normal, Math.sin(state.pitch))
            .normalize();
        const forwardWorld = this.localDirectionToWorld(forwardLocal, this.tmpVecC);
        const normalWorld = this.localDirectionToWorld(state.normal, this.tmpVecD);

        if (instant || deltaTime <= 0) {
            this.camera.position.copy(worldPosition);
            this.camera.up.copy(normalWorld);
        } else {
            const alpha = smoothFactor(26, deltaTime);
            this.camera.position.lerp(worldPosition, alpha);
            this.camera.up.lerp(normalWorld, alpha).normalize();
        }
        this.camera.lookAt(this.camera.position.clone().add(forwardWorld));
    }

    updateDinoThirdPersonCamera(deltaTime, instant = false) {
        const dino = this.controlledDino;
        if (!dino) return;
        const state = this.dinoState;
        const preset = this.getCameraPreset();
        const radius = this.getPlanetRadius();
        const scale = this.getDinoVisualScale(dino);
        const distance = preset.dinoDistance * Math.max(0.82, Math.sqrt(radius / 10)) * Math.max(1, scale * 0.45) * this.dinoCameraDistanceScale;
        const height = preset.dinoHeight * Math.max(0.9, Math.sqrt(radius / 10)) * Math.max(1, scale * 0.5) * 0.72;
        const pitchHeight = Math.sin(state.pitch) * distance * 0.45;
        const dinoPosition = dino.group.position;
        const desiredLocal = this.tmpVecA.copy(dinoPosition)
            .addScaledVector(state.heading, -distance)
            .addScaledVector(state.normal, height + pitchHeight);
        const minSurface = this.getPlanetRadius() + this.getSurfaceHeight(state.normal) + this.getMinimumCameraClearance(scale);
        const localFromCenter = this.tmpVecB.copy(desiredLocal).sub(this.getPlanetCenterLocal());
        if (localFromCenter.length() < minSurface) {
            desiredLocal.copy(this.getPlanetCenterLocal()).addScaledVector(state.normal, minSurface);
        }

        const targetLocal = this.tmpVecC.copy(dinoPosition)
            .addScaledVector(state.normal, 0.42 + scale * 0.8)
            .addScaledVector(state.heading, 0.18 + scale * 0.4);

        const desiredWorld = desiredLocal.clone();
        const targetWorld = targetLocal.clone();
        this.surfaceGroup.localToWorld(desiredWorld);
        this.surfaceGroup.localToWorld(targetWorld);
        const normalWorld = this.localDirectionToWorld(state.normal, this.tmpVecD);

        if (instant || deltaTime <= 0) {
            this.camera.position.copy(desiredWorld);
            this.camera.up.copy(normalWorld);
        } else {
            const alpha = smoothFactor(8.5, deltaTime);
            this.camera.position.lerp(desiredWorld, alpha);
            this.camera.up.lerp(normalWorld, alpha).normalize();
        }
        this.camera.lookAt(targetWorld);
        if (this.controls) this.controls.target.copy(targetWorld);
    }

    getMoveInput() {
        return {
            forward: (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0),
            right: (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0)
        };
    }

    normalFromWorldPoint(worldPoint, target) {
        this.surfaceGroup.updateWorldMatrix(true, false);
        target.copy(worldPoint);
        this.surfaceGroup.worldToLocal(target);
        target.sub(this.getPlanetCenterLocal()).normalize();
        return target;
    }

    cameraForwardOnSurface(normal, target) {
        this.camera.getWorldDirection(target);
        this.worldDirectionToLocal(target, target);
        this.projectOntoTangent(target, normal, this.tangentFromNormal(normal));
        return target;
    }

    projectOntoTangent(vector, normal, fallback) {
        vector.addScaledVector(normal, -vector.dot(normal));
        if (vector.lengthSq() < EPSILON) {
            if (fallback && fallback.lengthSq?.() > EPSILON) {
                vector.copy(fallback).addScaledVector(normal, -fallback.dot(normal));
            }
            if (vector.lengthSq() < EPSILON) vector.copy(this.tangentFromNormal(normal));
        }
        return vector.normalize();
    }

    flattenToTangent(vector, normal) {
        return vector.addScaledVector(normal, -vector.dot(normal));
    }

    tangentFromNormal(normal) {
        const helper = Math.abs(normal.y) > 0.86
            ? this.tmpVecD.set(1, 0, 0)
            : this.tmpVecD.set(0, 1, 0);
        return new this.THREE.Vector3().crossVectors(helper, normal).normalize();
    }

    getRightFromHeading(heading, normal, target) {
        target.crossVectors(heading, normal);
        if (target.lengthSq() < EPSILON) target.copy(this.tangentFromNormal(normal));
        return target.normalize();
    }

    getSurfacePositionLocal(normal, groundOffset = 0, extraOffset = 0) {
        return this.getPlanetCenterLocal().clone().addScaledVector(
            normal,
            this.getPlanetRadius() + this.getSurfaceHeight(normal) + groundOffset + extraOffset
        );
    }

    getSurfaceHeight(normal) {
        const sampled = this.getPlanetSurfaceHeight(normal) || 0;
        return Number.isFinite(sampled) ? sampled : 0;
    }

    getPlanetCenterLocal() {
        const center = this.getPlanetCenter();
        return center?.isVector3 ? center : this.tmpVecD.set(0, 0, 0);
    }

    getWorldPlanetCenter() {
        this.surfaceGroup.updateWorldMatrix(true, false);
        const world = this.getPlanetCenterLocal().clone();
        this.surfaceGroup.localToWorld(world);
        return world;
    }

    worldDirectionToLocal(direction, target) {
        this.surfaceGroup.updateWorldMatrix(true, false);
        this.tmpMatrix.copy(this.surfaceGroup.matrixWorld).invert();
        return target.copy(direction).transformDirection(this.tmpMatrix).normalize();
    }

    localDirectionToWorld(direction, target) {
        this.surfaceGroup.updateWorldMatrix(true, false);
        return target.copy(direction).transformDirection(this.surfaceGroup.matrixWorld).normalize();
    }

    getPlanetMoveSpeed() {
        return this.keys.has('shift') ? this.getPlanetRunSpeed() : this.getPlanetWalkSpeed();
    }

    getPlanetWalkSpeed() {
        const settings = this.getSettings();
        return this.getPlanetRadius() * 0.28 * Math.max(0.15, Number(settings.explorationWalkSpeed || 1));
    }

    getPlanetRunSpeed() {
        const settings = this.getSettings();
        return this.getPlanetRadius() * 0.46 * Math.max(0.2, Number(settings.explorationRunSpeed || 1));
    }

    getDinoMoveSpeed(dino) {
        const settings = this.getSettings();
        const scaleBoost = Math.max(0.85, Math.sqrt(this.getDinoVisualScale(dino) || 1) * 0.72);
        const runMultiplier = this.keys.has('shift') ? 1.75 : 1;
        return this.getPlanetRadius() * 0.24 * Math.max(0.15, Number(settings.explorationDinoSpeed || 1)) * scaleBoost * runMultiplier;
    }

    getCameraPreset() {
        const settings = this.getSettings();
        return CAMERA_DISTANCE_PRESETS[settings.explorationCameraDistance] || CAMERA_DISTANCE_PRESETS.medium;
    }

    getEyeHeight() {
        return Math.max(0.24, this.getPlanetRadius() * 0.035);
    }

    getHeadBobIntensity() {
        return Math.max(0, Number(this.getSettings().explorationHeadBobIntensity ?? 1));
    }

    getMinimumCameraClearance(scale = 1) {
        return Math.max(this.getPlanetRadius() * 0.18, 0.8 + scale * 0.5);
    }

    getDinoVisualScale(dino) {
        const dinoSystem = this.getDinoSystem();
        const speciesScale = dinoSystem?.getSpeciesScale?.(dino?.species) || 0.35;
        return speciesScale * (this.getSettings().dinoScale || 1);
    }

    isDinoAvailable(dino) {
        const dinoSystem = this.getDinoSystem();
        return Boolean(
            dino &&
            dino.group?.parent &&
            dino.mesh &&
            dinoSystem?.population?.includes?.(dino)
        );
    }

    updateHudForMode() {
        if (this.mode === ControlMode.PLANET_FPS) {
            this.updateHud('Modo primeira pessoa', 'WASD mover, Shift correr, Espaco pular, scroll altera FOV, ESC sair');
        } else if (this.mode === ControlMode.DINO_THIRD_PERSON) {
            this.updateHud('Controlando dino', 'WASD mover, Shift correr, mouse olhar, scroll ajusta distancia, ESC sair');
        }
    }

    updateHud(title, hint) {
        this.hud.querySelector('[data-exploration-title]').textContent = title;
        this.hud.querySelector('[data-exploration-hint]').textContent = hint || 'ESC para sair';
        this.hud.classList.add('is-visible');
    }

    isExplorationModeActive() {
        return this.mode !== ControlMode.ORBIT;
    }

    getMode() {
        return this.mode;
    }

    dispose() {
        this.exitExplorationMode({ silent: true });
        this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        document.removeEventListener('pointerlockerror', this.onPointerLockError);
        window.removeEventListener('keydown', this.onKeyDown, true);
        window.removeEventListener('keyup', this.onKeyUp, true);
        window.removeEventListener('wheel', this.onWheel, { passive: false });
        window.removeEventListener('blur', this.onBlur);
        this.hud.remove();
    }
}
