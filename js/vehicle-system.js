import { JeepController } from './jeep-controller.js';
import { ShipController } from './ship-controller.js';
import { VehicleCameraController } from './vehicle-camera-controller.js';

const EPSILON = 0.000001;
const DOUBLE_ESC_EXIT_MS = 900;
const VEHICLE_GLOBAL_SCALE = 0.5;
const VEHICLE_BASE_SCALE = {
    jeep: 0.075,
    ship: 0.085
};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

export class VehicleSystem {
    constructor(options = {}) {
        this.THREE = options.THREE;
        this.scene = options.scene;
        this.camera = options.camera;
        this.renderer = options.renderer;
        this.controls = options.controls;
        this.surfaceGroup = options.surfaceGroup;
        this.cosmicGroup = options.cosmicGroup || options.scene;
        this.getPlanetRadius = options.getPlanetRadius || (() => 10);
        this.getPlanetCenter = options.getPlanetCenter || (() => new this.THREE.Vector3());
        this.getPlanetSurfaceHeight = options.getPlanetSurfaceHeight || (() => 0);
        this.getPlanetMesh = options.getPlanetMesh || (() => null);
        this.getChaosToolbar = options.getChaosToolbar || (() => null);
        this.getExplorationControls = options.getExplorationControls || (() => null);
        this.getSettings = options.getSettings || (() => ({}));
        this.isRegenerating = options.isRegenerating || (() => false);
        this.pointerLockElement = this.renderer?.domElement || document.body;
        this.vehicles = [];
        this.activeVehicle = null;
        this.keys = new Set();
        this.savedChaosToolsEnabled = null;
        this.ignoreNextPointerUnlock = false;
        this.lastEscapePressTime = 0;
        this.previousCameraState = null;

        this.jeepController = new JeepController({
            THREE: this.THREE,
            getPlanetRadius: this.getPlanetRadius,
            getPlanetCenter: this.getPlanetCenter,
            getPlanetSurfaceHeight: this.getPlanetSurfaceHeight
        });
        this.shipController = new ShipController({
            THREE: this.THREE,
            scene: this.scene,
            surfaceGroup: this.surfaceGroup,
            cosmicGroup: this.cosmicGroup,
            getPlanetRadius: this.getPlanetRadius,
            getPlanetCenter: this.getPlanetCenter,
            getPlanetSurfaceHeight: this.getPlanetSurfaceHeight
        });
        this.cameraController = new VehicleCameraController({
            THREE: this.THREE,
            camera: this.camera,
            renderer: this.renderer,
            getSettings: this.getSettings
        });

        this.tmpVecA = new this.THREE.Vector3();
        this.tmpVecB = new this.THREE.Vector3();
        this.tmpVecC = new this.THREE.Vector3();
        this.createHud();
        this.bindEvents();
    }

    bindEvents() {
        this.onKeyDown = (event) => this.handleKeyDown(event);
        this.onKeyUp = (event) => this.handleKeyUp(event);
        this.onMouseMove = (event) => this.handleMouseMove(event);
        this.onWheel = (event) => this.handleWheel(event);
        this.onPointerLockChange = () => this.handlePointerLockChange();
        this.onBlur = () => this.keys.clear();
        window.addEventListener('keydown', this.onKeyDown, true);
        window.addEventListener('keyup', this.onKeyUp, true);
        document.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('wheel', this.onWheel, { passive: false });
        document.addEventListener('pointerlockchange', this.onPointerLockChange);
        window.addEventListener('blur', this.onBlur);
    }

    createHud() {
        if (!document.getElementById('vehicleSystemStyles')) {
            const style = document.createElement('style');
            style.id = 'vehicleSystemStyles';
            style.textContent = `
                .vehicle-hud {
                    position: fixed;
                    right: 18px;
                    bottom: 98px;
                    z-index: 30;
                    min-width: min(260px, calc(100vw - 32px));
                    display: none;
                    gap: 8px;
                    padding: 11px 12px;
                    color: #f5fbff;
                    background: rgba(4, 8, 18, 0.82);
                    border: 1px solid rgba(130, 210, 255, 0.28);
                    border-radius: 8px;
                    box-shadow: 0 16px 50px rgba(0, 0, 0, 0.42);
                    backdrop-filter: blur(14px);
                    pointer-events: none;
                    font-size: 0.76rem;
                }
                .vehicle-hud.is-visible { display: grid; }
                .vehicle-hud strong { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; }
                .vehicle-hud span { color: rgba(232, 245, 255, 0.76); }
                .vehicle-prompt {
                    position: fixed;
                    left: 50%;
                    bottom: 172px;
                    z-index: 31;
                    display: none;
                    transform: translateX(-50%);
                    padding: 8px 11px;
                    border: 1px solid rgba(160, 220, 255, 0.32);
                    border-radius: 8px;
                    background: rgba(4, 10, 22, 0.82);
                    color: #f5fbff;
                    font-size: 0.78rem;
                    font-weight: 700;
                    pointer-events: none;
                    backdrop-filter: blur(12px);
                }
                .vehicle-prompt.is-visible { display: block; }
                body.wallpaper-mode .vehicle-hud,
                body.wallpaper-mode .vehicle-prompt { display: none; }
            `;
            document.head.appendChild(style);
        }
        this.hud = document.createElement('div');
        this.hud.className = 'vehicle-hud';
        this.hud.innerHTML = `
            <strong data-vehicle-title>Veiculo</strong>
            <span data-vehicle-speed>Velocidade 0</span>
            <span data-vehicle-camera>Camera terceira pessoa</span>
            <span data-vehicle-hint>WASD mover, Shift boost, E sair</span>
        `;
        this.prompt = document.createElement('div');
        this.prompt.className = 'vehicle-prompt';
        this.prompt.textContent = 'Pressione E para entrar';
        document.body.appendChild(this.hud);
        document.body.appendChild(this.prompt);
    }

    deployVehicle(type, worldPosition, normalWorld) {
        const normalLocal = this.worldDirectionToLocal(normalWorld, this.tmpVecA).normalize();
        const localPosition = worldPosition.clone();
        this.surfaceGroup.worldToLocal(localPosition);
        const center = this.getPlanetCenter();
        const forward = this.cameraForwardOnSurface(normalLocal, this.tmpVecB);
        const scale = this.getPlanetRadius() * (VEHICLE_BASE_SCALE[type] || VEHICLE_BASE_SCALE.jeep) * VEHICLE_GLOBAL_SCALE;
        const surfaceRadius = this.getPlanetRadius() + this.getSurfaceHeight(normalLocal) + scale * (type === 'ship' ? 0.9 : 0.58);
        localPosition.copy(center).addScaledVector(normalLocal, surfaceRadius);
        const group = type === 'ship' ? this.createShipModel(scale) : this.createJeepModel(scale);
        this.surfaceGroup.add(group);
        const vehicle = {
            id: `${type}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
            type,
            group,
            scale,
            localPosition,
            normal: normalLocal.clone(),
            forward: forward.clone(),
            velocity: new this.THREE.Vector3(),
            forwardWorld: forward.clone().transformDirection(this.surfaceGroup.matrixWorld).normalize(),
            upWorld: normalLocal.clone().transformDirection(this.surfaceGroup.matrixWorld).normalize(),
            rightWorld: new this.THREE.Vector3().crossVectors(
                forward.clone().transformDirection(this.surfaceGroup.matrixWorld).normalize(),
                normalLocal.clone().transformDirection(this.surfaceGroup.matrixWorld).normalize()
            ).normalize(),
            verticalVelocity: 0,
            grounded: true,
            landed: true,
            occupied: false,
            health: 100,
            speed: 0,
            maxSpeed: 1,
            altitude: 0,
            takeoffCooldown: 0,
            flightTime: 0,
            rollAngle: 0,
            rollVelocity: 0,
            input: {},
            parts: group.userData.parts || {}
        };
        group.userData.vehicle = vehicle;
        if (type === 'ship') this.shipController.alignLocalVehicle(vehicle, 0);
        else this.jeepController.alignVehicle(vehicle, 0);
        this.vehicles.push(vehicle);
        this.updatePrompt();
        return vehicle;
    }

    createJeepModel(scale) {
        const { THREE } = this;
        const group = new THREE.Group();
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x3f7f5f, roughness: 0.5, metalness: 0.08 });
        const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x76b77a, roughness: 0.48, metalness: 0.06 });
        const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1015, roughness: 0.82, metalness: 0.08 });
        const hubMaterial = new THREE.MeshStandardMaterial({ color: 0xb6c3c8, roughness: 0.34, metalness: 0.5 });
        const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x9aaab0, roughness: 0.36, metalness: 0.48 });
        const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xf5fbff });

        const body = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.45, scale * 0.55, scale * 2.2), bodyMaterial);
        body.position.y = scale * 0.6;
        const hood = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.24, scale * 0.28, scale * 0.72), accentMaterial);
        hood.position.set(0, scale * 0.82, -scale * 0.58);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.02, scale * 0.5, scale * 0.78), bodyMaterial);
        cabin.position.set(0, scale * 1.02, scale * 0.24);
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.62, scale * 0.16, scale * 0.16), metalMaterial);
        bumper.position.set(0, scale * 0.52, -scale * 1.24);
        const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.46, scale * 0.13, scale * 0.14), metalMaterial);
        rearBumper.position.set(0, scale * 0.48, scale * 1.18);

        const cageBar = new THREE.Mesh(new THREE.TorusGeometry(scale * 0.52, scale * 0.035, 8, 28), metalMaterial);
        cageBar.position.set(0, scale * 1.26, scale * 0.18);
        cageBar.scale.z = 0.62;
        cageBar.rotation.x = Math.PI / 2;
        const cageTop = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.05, scale * 0.07, scale * 0.78), metalMaterial);
        cageTop.position.set(0, scale * 1.5, scale * 0.14);

        const axleFront = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.035, scale * 0.035, scale * 1.95, 10), metalMaterial);
        axleFront.rotation.z = Math.PI / 2;
        axleFront.position.set(0, scale * 0.38, -scale * 0.78);
        const axleRear = axleFront.clone();
        axleRear.position.z = scale * 0.82;

        const lights = [-1, 1].map((side) => {
            const light = new THREE.Mesh(new THREE.SphereGeometry(scale * 0.11, 12, 8), lightMaterial);
            light.position.set(side * scale * 0.42, scale * 0.72, -scale * 1.2);
            return light;
        });
        const wheels = [];
        const frontWheels = [];
        const wheelRadius = scale * 0.42;
        const wheelWidth = scale * 0.28;
        [-1, 1].forEach((x) => {
            [-1, 1].forEach((z) => {
                const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24), tireMaterial);
                wheel.rotation.z = Math.PI / 2;
                wheel.position.set(x * scale * 0.86, scale * 0.42, z * scale * 0.82);
                wheels.push(wheel);
                const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.42, wheelRadius * 0.42, wheelWidth * 1.04, 18), hubMaterial);
                hub.rotation.z = Math.PI / 2;
                hub.position.copy(wheel.position);
                group.add(hub);
                if (z < 0) frontWheels.push(wheel);
            });
        });
        group.add(body, hood, cabin, bumper, rearBumper, cageBar, cageTop, axleFront, axleRear, ...lights, ...wheels);
        group.userData.parts = { body, wheels, frontWheels };
        return group;
    }

    createShipModel(scale) {
        const { THREE } = this;
        const group = new THREE.Group();
        const hullMaterial = new THREE.MeshStandardMaterial({ color: 0xced7e8, roughness: 0.34, metalness: 0.42 });
        const wingMaterial = new THREE.MeshStandardMaterial({ color: 0x5e78a0, roughness: 0.45, metalness: 0.2 });
        const cockpitMaterial = new THREE.MeshStandardMaterial({ color: 0x63d9ff, emissive: 0x136a8c, emissiveIntensity: 0.45, roughness: 0.18, metalness: 0.1 });
        const flameMaterial = new THREE.MeshBasicMaterial({ color: 0x5ff7ff, transparent: true, opacity: 0.74, blending: THREE.AdditiveBlending, depthWrite: false });
        const body = new THREE.Mesh(new THREE.BoxGeometry(scale * 0.72, scale * 0.42, scale * 1.62), hullMaterial);
        body.position.y = scale * 0.56;
        const nose = new THREE.Mesh(new THREE.ConeGeometry(scale * 0.36, scale * 0.86, 24), hullMaterial);
        nose.rotation.x = -Math.PI / 2;
        nose.position.set(0, scale * 0.56, -scale * 1.24);
        const cockpit = new THREE.Mesh(new THREE.SphereGeometry(scale * 0.32, 18, 12), cockpitMaterial);
        cockpit.scale.set(0.9, 0.55, 1.15);
        cockpit.position.set(0, scale * 0.9, -scale * 0.28);
        const wingA = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.95, scale * 0.12, scale * 0.58), wingMaterial);
        wingA.position.set(0, scale * 0.38, scale * 0.12);
        const fin = new THREE.Mesh(new THREE.BoxGeometry(scale * 0.16, scale * 0.72, scale * 0.48), wingMaterial);
        fin.position.set(0, scale * 0.96, scale * 0.72);
        const thrusters = [-1, 1].map((side) => {
            const flame = new THREE.Mesh(new THREE.ConeGeometry(scale * 0.16, scale * 0.7, 18, 1, true), flameMaterial.clone());
            flame.position.set(side * scale * 0.28, scale * 0.42, scale * 1.08);
            flame.rotation.x = Math.PI / 2;
            return flame;
        });
        const skids = [-1, 1].map((side) => {
            const skid = new THREE.Mesh(new THREE.BoxGeometry(scale * 0.13, scale * 0.12, scale * 1.1), wingMaterial);
            skid.position.set(side * scale * 0.48, scale * 0.07, scale * 0.04);
            return skid;
        });
        group.add(body, nose, cockpit, wingA, fin, ...thrusters, ...skids);
        group.userData.parts = { thrusters };
        return group;
    }

    handleKeyDown(event) {
        if (isEditableTarget(event.target)) return;
        const key = this.normalizeKey(event);
        if (key === 'escape' && this.activeVehicle) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            const now = performance.now();
            const shouldExit = now - this.lastEscapePressTime <= DOUBLE_ESC_EXIT_MS;
            this.lastEscapePressTime = now;
            if (shouldExit) {
                this.exitVehicle({ forceOrbit: true });
                return;
            }
            this.exitPointerLock();
            return;
        }
        if (key === 'e') {
            const handled = this.activeVehicle ? this.exitVehicle() : this.tryEnterNearestVehicle();
            if (handled) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation?.();
            }
            return;
        }
        if (!this.activeVehicle) return;
        if (key === 'control') {
            this.keys.add(key);
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            return;
        }
        if (['w', 'a', 's', 'd', 'shift', ' '].includes(key)) {
            this.keys.add(key);
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
        }
    }

    handleKeyUp(event) {
        this.keys.delete(this.normalizeKey(event));
    }

    handleMouseMove(event) {
        if (!this.activeVehicle || document.pointerLockElement !== this.pointerLockElement) return;
        this.cameraController.handleMouseMove(event.movementX || 0, event.movementY || 0, this.activeVehicle);
    }

    handleWheel(event) {
        if (!this.activeVehicle || isEditableTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        this.cameraController.handleWheel(event.deltaY || 0, this.activeVehicle);
    }

    handlePointerLockChange() {
        if (document.pointerLockElement === this.pointerLockElement) return;
        if (this.ignoreNextPointerUnlock) {
            this.ignoreNextPointerUnlock = false;
            return;
        }
    }

    tryEnterNearestVehicle() {
        const vehicle = this.findNearestEnterableVehicle();
        if (!vehicle) return false;
        this.enterVehicle(vehicle);
        return true;
    }

    enterVehicle(vehicle) {
        if (!vehicle || this.activeVehicle) return false;
        if (vehicle.type === 'ship' && !vehicle.landed) return false;
        this.getExplorationControls()?.exitExplorationMode?.({ silent: true });
        this.saveCameraState();
        this.activeVehicle = vehicle;
        vehicle.occupied = true;
        this.cameraController.resetForVehicle(vehicle);
        this.disableChaosTools();
        if (this.controls) this.controls.enabled = false;
        this.updateVehicleCamera(0, true);
        this.requestPointerLock();
        this.prompt.classList.remove('is-visible');
        this.hud.classList.add('is-visible');
        return true;
    }

    exitVehicle(options = {}) {
        const vehicle = this.activeVehicle;
        if (!vehicle) return false;
        if (vehicle.type === 'ship' && !vehicle.landed && !options.forceOrbit) return false;
        vehicle.occupied = false;
        this.activeVehicle = null;
        this.keys.clear();
        this.lastEscapePressTime = 0;
        this.restoreChaosTools();
        this.exitPointerLock();
        this.hud.classList.remove('is-visible');
        if (options.forceOrbit) {
            this.restoreCameraState();
            if (this.controls) {
                this.controls.enabled = true;
                if (!this.previousCameraState?.target) {
                    this.controls.target.copy(vehicle.group.getWorldPosition(new this.THREE.Vector3()));
                }
            }
            this.previousCameraState = null;
            return true;
        }
        this.previousCameraState = null;
        const exitPoint = vehicle.group.getWorldPosition(new this.THREE.Vector3())
            .addScaledVector(vehicle.upWorld || new this.THREE.Vector3(0, 1, 0), vehicle.scale * 0.9);
        this.getExplorationControls()?.enterPlanetFirstPersonMode?.(exitPoint);
        return true;
    }

    saveCameraState() {
        if (this.previousCameraState) return;
        this.previousCameraState = {
            position: this.camera.position.clone(),
            quaternion: this.camera.quaternion.clone(),
            up: this.camera.up.clone(),
            fov: this.camera.fov,
            target: this.controls?.target?.clone?.() || null
        };
    }

    restoreCameraState() {
        const state = this.previousCameraState;
        if (!state) return;
        this.camera.position.copy(state.position);
        this.camera.quaternion.copy(state.quaternion);
        this.camera.up.copy(state.up);
        this.camera.fov = state.fov;
        this.camera.updateProjectionMatrix();
        if (state.target && this.controls?.target) this.controls.target.copy(state.target);
    }

    update(deltaTime) {
        if (this.isRegenerating()) {
            this.clear();
            return;
        }
        for (const vehicle of this.vehicles) {
            if (!vehicle.group?.parent) continue;
            if (vehicle.type === 'ship') {
                if (vehicle.landed) this.shipController.alignLocalVehicle(vehicle, deltaTime);
            } else if (!vehicle.occupied) {
                this.jeepController.alignVehicle(vehicle, deltaTime);
            }
        }

        if (this.activeVehicle) {
            this.updateActiveVehicle(deltaTime);
        } else {
            this.updatePrompt();
        }
    }

    updateActiveVehicle(deltaTime) {
        const vehicle = this.activeVehicle;
        if (!vehicle?.group?.parent) {
            this.activeVehicle = null;
            this.hud.classList.remove('is-visible');
            return;
        }
        const input = this.getInput();
        vehicle.input = input;
        const cameraForward = this.cameraController.getCameraForward(vehicle, this.tmpVecC);
        if (vehicle.type === 'jeep') {
            this.jeepController.update(vehicle, deltaTime, input);
            vehicle.forwardWorld.copy(vehicle.forward).transformDirection(this.surfaceGroup.matrixWorld).normalize();
            vehicle.upWorld.copy(vehicle.normal).transformDirection(this.surfaceGroup.matrixWorld).normalize();
        } else {
            this.shipController.update(vehicle, deltaTime, input, cameraForward);
        }

        this.updateVehicleCamera(deltaTime);
        this.updateHud(vehicle);
        if (this.controls) this.controls.enabled = false;
    }

    updateVehicleCamera(deltaTime, instant = false) {
        const vehicle = this.activeVehicle;
        if (!vehicle) return;
        const planetCenter = this.tmpVecA.copy(this.getPlanetCenter());
        this.surfaceGroup.localToWorld(planetCenter);
        this.cameraController.update(vehicle, deltaTime, {
            instant,
            planetCenter,
            planetRadius: this.getPlanetRadius(),
            getSurfaceHeightForWorldNormal: (worldNormal) => {
                const localNormal = this.worldDirectionToLocal(worldNormal, this.tmpVecB);
                return this.getSurfaceHeight(localNormal);
            },
            input: vehicle.input || {},
            shake: vehicle.type === 'jeep'
                ? clamp((vehicle.speed || 0) / Math.max(1, this.getPlanetRadius() * 28), 0, 0.08)
                : clamp(((vehicle.input?.boost ? 0.035 : 0) + (vehicle.speed || 0) / Math.max(1, this.getPlanetRadius() * 700)), 0, 0.055)
        });
    }

    updateHud(vehicle) {
        const speed = Math.round((vehicle.speed || 0) * 8);
        const cameraMode = this.cameraController.mode === 'first' ? 'primeira pessoa' : 'terceira pessoa';
        this.hud.querySelector('[data-vehicle-title]').textContent = vehicle.type === 'ship' ? 'Nave espacial' : 'Jeep planetario';
        this.hud.querySelector('[data-vehicle-speed]').textContent = vehicle.type === 'ship'
            ? `Velocidade ${speed} | Altitude ${Math.round(vehicle.altitude || 0)}`
            : `Velocidade ${speed}`;
        this.hud.querySelector('[data-vehicle-camera]').textContent = `Camera ${cameraMode}`;
        this.hud.querySelector('[data-vehicle-hint]').textContent = vehicle.type === 'ship' && !vehicle.landed
            ? 'Mouse mirar, W acelerar, S frear, Shift boost, Espaco/Ctrl subir/descer, A/D roll'
            : 'WASD mover, Shift boost, Espaco impulso, E sair';
    }

    updatePrompt() {
        const vehicle = this.findNearestEnterableVehicle();
        if (!vehicle) {
            this.prompt.classList.remove('is-visible');
            return;
        }
        this.prompt.textContent = vehicle.type === 'ship' ? 'Pressione E para entrar na nave' : 'Pressione E para entrar no Jeep';
        this.prompt.classList.add('is-visible');
    }

    findNearestEnterableVehicle() {
        const playerPosition = this.getPlayerPosition();
        let best = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        const enterDistance = Math.max(1.35, this.getPlanetRadius() * 0.12);
        for (const vehicle of this.vehicles) {
            if (!vehicle.group?.parent || vehicle.occupied || (vehicle.type === 'ship' && !vehicle.landed)) continue;
            const position = vehicle.group.getWorldPosition(this.tmpVecA);
            const distance = position.distanceTo(playerPosition);
            if (distance < enterDistance && distance < bestDistance) {
                best = vehicle;
                bestDistance = distance;
            }
        }
        return best;
    }

    getPlayerPosition() {
        return this.camera.position.clone();
    }

    getInput() {
        const forward = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0);
        const right = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0);
        const boost = this.keys.has('shift');
        const jump = this.keys.has(' ');
        const descend = this.keys.has('control');
        return {
            forward,
            right,
            boost,
            jump,
            descend,
            handbrake: jump,
            shipThrottle: this.keys.has('w') ? 1 : 0,
            shipBrake: this.keys.has('s') ? 1 : 0,
            shipBoost: boost,
            shipVertical: (jump ? 1 : 0) - (descend ? 1 : 0),
            shipRoll: right
        };
    }

    getShipInput() {
        return {
            throttle: this.keys.has('w') ? 1 : 0,
            brake: this.keys.has('s') ? 1 : 0,
            boost: this.keys.has('shift'),
            vertical: (this.keys.has(' ') ? 1 : 0) - (this.keys.has('control') ? 1 : 0),
            roll: (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0)
        };
    }

    normalizeKey(event) {
        const code = event.code || '';
        if (code === 'KeyW') return 'w';
        if (code === 'KeyA') return 'a';
        if (code === 'KeyS') return 's';
        if (code === 'KeyD') return 'd';
        if (code === 'KeyE') return 'e';
        if (code === 'ShiftLeft' || code === 'ShiftRight') return 'shift';
        if (code === 'ControlLeft' || code === 'ControlRight') return 'control';
        if (code === 'Space') return ' ';
        return String(event.key || '').toLowerCase();
    }

    cameraForwardOnSurface(normal, target) {
        this.camera.getWorldDirection(target);
        this.worldDirectionToLocal(target, target);
        target.addScaledVector(normal, -target.dot(normal));
        if (target.lengthSq() < EPSILON) target.copy(this.tangentFromNormal(normal));
        return target.normalize();
    }

    tangentFromNormal(normal) {
        const helper = Math.abs(normal.y) > 0.86 ? this.tmpVecC.set(1, 0, 0) : this.tmpVecC.set(0, 1, 0);
        return new this.THREE.Vector3().crossVectors(helper, normal).normalize();
    }

    worldDirectionToLocal(direction, target) {
        const matrix = new this.THREE.Matrix4().copy(this.surfaceGroup.matrixWorld).invert();
        return target.copy(direction).transformDirection(matrix).normalize();
    }

    getSurfaceHeight(normal) {
        const height = this.getPlanetSurfaceHeight(normal) || 0;
        return Number.isFinite(height) ? height : 0;
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

    requestPointerLock() {
        try {
            this.pointerLockElement?.requestPointerLock?.();
        } catch (error) {
            console.warn('Nao foi possivel ativar Pointer Lock no veiculo.', error);
        }
    }

    exitPointerLock() {
        if (document.pointerLockElement !== this.pointerLockElement) return;
        this.ignoreNextPointerUnlock = true;
        try {
            document.exitPointerLock?.();
        } catch (error) {
            this.ignoreNextPointerUnlock = false;
        }
    }

    isVehicleModeActive() {
        return Boolean(this.activeVehicle);
    }

    hasActiveVehicle() {
        return Boolean(this.activeVehicle);
    }

    clear() {
        if (this.activeVehicle) {
            this.activeVehicle.occupied = false;
            this.activeVehicle = null;
        }
        this.keys.clear();
        this.lastEscapePressTime = 0;
        this.previousCameraState = null;
        this.restoreChaosTools();
        this.hud?.classList.remove('is-visible');
        this.prompt?.classList.remove('is-visible');
        this.vehicles.forEach((vehicle) => disposeObject(vehicle.group));
        this.vehicles.length = 0;
    }

    dispose() {
        this.clear();
        window.removeEventListener('keydown', this.onKeyDown, true);
        window.removeEventListener('keyup', this.onKeyUp, true);
        document.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('wheel', this.onWheel, { passive: false });
        document.removeEventListener('pointerlockchange', this.onPointerLockChange);
        window.removeEventListener('blur', this.onBlur);
        this.hud?.remove();
        this.prompt?.remove();
    }
}
