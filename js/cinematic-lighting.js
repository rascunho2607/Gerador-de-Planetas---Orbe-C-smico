import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const PRESETS = {
    low: {
        exposure: 0.98,
        contrast: 1.04,
        intensity: 0.9,
        ambient: 0.18,
        hemisphere: 0.22,
        rim: 0.16,
        bloom: false,
        bloomStrength: 0.22,
        bloomRadius: 0.18,
        bloomThreshold: 0.82,
        shadows: false,
        shadowQuality: 'off',
        atmosphereFresnel: true,
        fakeReflections: true,
        ambientOcclusion: false
    },
    medium: {
        exposure: 1.08,
        contrast: 1.1,
        intensity: 1,
        ambient: 0.22,
        hemisphere: 0.32,
        rim: 0.28,
        bloom: true,
        bloomStrength: 0.42,
        bloomRadius: 0.3,
        bloomThreshold: 0.72,
        shadows: false,
        shadowQuality: 'off',
        atmosphereFresnel: true,
        fakeReflections: true,
        ambientOcclusion: false
    },
    high: {
        exposure: 1.13,
        contrast: 1.16,
        intensity: 1.08,
        ambient: 0.2,
        hemisphere: 0.38,
        rim: 0.38,
        bloom: true,
        bloomStrength: 0.58,
        bloomRadius: 0.42,
        bloomThreshold: 0.65,
        shadows: true,
        shadowQuality: 'medium',
        atmosphereFresnel: true,
        fakeReflections: true,
        ambientOcclusion: true
    },
    cinematic: {
        exposure: 1.18,
        contrast: 1.24,
        intensity: 1.16,
        ambient: 0.18,
        hemisphere: 0.44,
        rim: 0.5,
        bloom: true,
        bloomStrength: 0.74,
        bloomRadius: 0.55,
        bloomThreshold: 0.58,
        shadows: true,
        shadowQuality: 'high',
        atmosphereFresnel: true,
        fakeReflections: true,
        ambientOcclusion: true
    }
};

const PRESET_ALIASES = {
    baixo: 'low',
    medio: 'medium',
    alto: 'high',
    cinematografico: 'cinematic'
};

const DEFAULT_OPTIONS = {
    enabled: true,
    preset: 'medium',
    toneMapping: true,
    exposure: 1.08,
    contrast: 1.1,
    intensity: 1,
    bloom: true,
    bloomStrength: 0.42,
    shadows: false,
    shadowQuality: 'off',
    atmosphereFresnel: true,
    fakeReflections: true,
    ambientOcclusion: false
};

const gradeShader = {
    uniforms: {
        tDiffuse: { value: null },
        contrast: { value: 1.1 },
        saturation: { value: 1.04 },
        lift: { value: 0.01 },
        vignette: { value: 0.16 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float contrast;
        uniform float saturation;
        uniform float lift;
        uniform float vignette;
        varying vec2 vUv;

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec3 color = texel.rgb;
            color = (color - 0.5) * contrast + 0.5;
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luma), color, saturation);
            float d = distance(vUv, vec2(0.5));
            color *= 1.0 - smoothstep(0.36, 0.82, d) * vignette;
            color += lift;
            gl_FragColor = vec4(max(color, 0.0), texel.a);
        }
    `
};

let activeContext = null;

function normalizePresetName(name) {
    const key = String(name || 'medium').trim().toLowerCase();
    return PRESETS[key] ? key : (PRESET_ALIASES[key] || 'medium');
}

function copyPresetOptions(presetName) {
    return { ...PRESETS[normalizePresetName(presetName)] };
}

function applyRendererColorManagement(renderer, options, original) {
    if (!renderer) return;
    if (!options.enabled || !options.toneMapping) {
        if (original) {
            if ('outputColorSpace' in renderer && original.outputColorSpace !== undefined) renderer.outputColorSpace = original.outputColorSpace;
            if ('outputEncoding' in renderer && original.outputEncoding !== undefined) renderer.outputEncoding = original.outputEncoding;
            renderer.toneMapping = original.toneMapping;
            renderer.toneMappingExposure = original.toneMappingExposure;
        }
        return;
    }

    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderer && THREE.sRGBEncoding) {
        renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = Math.max(0.2, options.exposure ?? 1);
}

function insertPassBefore(composer, pass, beforePass) {
    if (!composer || !pass || composer.passes?.includes(pass)) return;
    const passes = composer.passes || [];
    const beforeIndex = beforePass ? passes.indexOf(beforePass) : -1;
    const index = beforeIndex >= 0 ? beforeIndex : passes.length;
    if (typeof composer.insertPass === 'function') {
        composer.insertPass(pass, index);
    } else {
        passes.splice(index, 0, pass);
    }
    pass.setSize?.(window.innerWidth, window.innerHeight);
}

function removePass(composer, pass) {
    const passes = composer?.passes;
    if (!passes) return;
    const index = passes.indexOf(pass);
    if (index >= 0) passes.splice(index, 1);
}

function createAtmosphereMaterial(color = 0x77baff) {
    return new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
            atmosphereColor: { value: new THREE.Color(color) },
            intensity: { value: 0.12 },
            fresnelPower: { value: 2.1 },
            lightDirection: { value: new THREE.Vector3(-1, 0.3, -0.8).normalize() },
            time: { value: 0 }
        },
        vertexShader: `
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 atmosphereColor;
            uniform float intensity;
            uniform float fresnelPower;
            uniform vec3 lightDirection;
            uniform float time;
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;

            void main() {
                vec3 normalDir = normalize(vWorldNormal);
                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                vec3 sunDir = normalize(lightDirection);
                float rim = pow(1.0 - abs(dot(normalDir, viewDir)), fresnelPower);
                float daySide = smoothstep(-0.42, 0.74, dot(normalDir, sunDir));
                float pulse = 0.96 + sin(time * 0.55) * 0.04;
                float alpha = intensity * pulse * (0.05 + rim * (0.85 + daySide * 0.9));
                vec3 color = atmosphereColor * (0.55 + rim * 1.85 + daySide * 0.35);
                gl_FragColor = vec4(color, alpha);
            }
        `
    });
}

function createOceanSheen(radius) {
    const geometry = new THREE.SphereGeometry(radius * 1.006, 96, 64);
    const material = new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        uniforms: {
            color: { value: new THREE.Color(0x78d8ff) },
            lightDirection: { value: new THREE.Vector3(-1, 0.35, -0.8).normalize() },
            intensity: { value: 0.22 },
            waterLevel: { value: 0.35 }
        },
        vertexShader: `
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform vec3 lightDirection;
            uniform float intensity;
            uniform float waterLevel;
            varying vec3 vWorldNormal;
            varying vec3 vWorldPosition;

            void main() {
                vec3 normalDir = normalize(vWorldNormal);
                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                vec3 sunDir = normalize(lightDirection);
                float daySide = smoothstep(-0.08, 0.82, dot(normalDir, sunDir));
                vec3 reflected = reflect(-sunDir, normalDir);
                float specular = pow(max(dot(reflected, viewDir), 0.0), 72.0);
                float fresnel = pow(1.0 - max(dot(normalDir, viewDir), 0.0), 3.0);
                float alpha = intensity * daySide * (specular * 0.9 + fresnel * 0.12) * smoothstep(0.04, 0.55, waterLevel);
                gl_FragColor = vec4(color * (0.35 + specular * 1.8), alpha);
            }
        `
    });
    const sheen = new THREE.Mesh(geometry, material);
    sheen.name = 'CinematicOceanSheen';
    sheen.userData.cinematicLighting = true;
    return sheen;
}

function getLightDirection(context, frameContext = {}) {
    const direction = context.tempLightDirection;
    const source = frameContext.sunPosition || context.lights.mainLight?.position;
    if (source) {
        direction.copy(source);
    } else {
        direction.set(-1, 0.35, -0.8);
    }
    if (direction.lengthSq() < 0.0001) direction.set(-1, 0.35, -0.8);
    return direction.normalize();
}

function updateLights(context, options, frameContext) {
    const { lights } = context;
    const direction = getLightDirection(context, frameContext);
    const preset = copyPresetOptions(options.preset);
    const intensity = options.intensity ?? preset.intensity ?? 1;

    if (lights.mainLight) {
        lights.mainLight.color.set(0xfff1d4);
        lights.mainLight.intensity = (frameContext.baseLightIntensity ?? 1.45) * intensity;
        lights.mainLight.castShadow = Boolean(options.shadows && options.shadowQuality !== 'off');
        lights.mainLight.target?.position.set(0, 0, 0);
        lights.mainLight.target?.updateMatrixWorld();
    }

    if (lights.ambientLight) {
        lights.ambientLight.color.set(0x172033);
        lights.ambientLight.intensity = options.enabled ? (preset.ambient ?? 0.2) : (frameContext.baseAmbientIntensity ?? 0.2);
    }

    context.hemisphereLight.visible = Boolean(options.enabled);
    context.hemisphereLight.intensity = (preset.hemisphere ?? 0.3) * intensity;
    context.hemisphereLight.color.set(0x9fc7ff);
    context.hemisphereLight.groundColor.set(0x130b17);

    context.rimLight.visible = Boolean(options.enabled);
    context.rimLight.intensity = (preset.rim ?? 0.28) * intensity;
    context.rimLight.position.copy(direction).multiplyScalar(-80);
    context.rimLight.position.y += 26;

    if (lights.backLight) {
        lights.backLight.color.set(0x82a8ff);
        lights.backLight.intensity = options.enabled ? (preset.rim ?? 0.28) * 0.62 : 0.5;
        lights.backLight.position.copy(direction).multiplyScalar(-55);
    }
    if (lights.warmFill) {
        lights.warmFill.color.set(0xffb46f);
        lights.warmFill.intensity = options.enabled ? 0.18 * intensity : 0.4;
    }
}

function updatePostProcessing(context, options) {
    const preset = copyPresetOptions(options.preset);
    context.bloomPass.enabled = Boolean(options.enabled && options.bloom);
    context.bloomPass.strength = options.bloomStrength ?? preset.bloomStrength ?? 0.4;
    context.bloomPass.radius = preset.bloomRadius ?? 0.3;
    context.bloomPass.threshold = preset.bloomThreshold ?? 0.7;

    context.gradePass.enabled = Boolean(options.enabled);
    context.gradePass.uniforms.contrast.value = options.contrast ?? preset.contrast ?? 1.1;
    context.gradePass.uniforms.saturation.value = options.enabled ? 1.04 + Math.max(0, (options.contrast ?? 1.1) - 1) * 0.15 : 1;
    context.gradePass.uniforms.lift.value = options.ambientOcclusion ? -0.004 : 0.006;
    context.gradePass.uniforms.vignette.value = options.ambientOcclusion ? 0.22 : 0.14;
}

function updateAtmosphere(context, options, frameContext, deltaTime) {
    const atmosphere = frameContext.atmosphereMesh;
    if (!atmosphere?.isMesh) return;

    if (!options.enabled || !options.atmosphereFresnel) {
        if (atmosphere.userData.cinematicOriginalMaterial) {
            atmosphere.material.dispose();
            atmosphere.material = atmosphere.userData.cinematicOriginalMaterial;
            atmosphere.userData.cinematicOriginalMaterial = null;
        }
        return;
    }

    if (!atmosphere.userData.cinematicOriginalMaterial) {
        atmosphere.userData.cinematicOriginalMaterial = atmosphere.material;
        atmosphere.material = createAtmosphereMaterial(frameContext.atmosphereColor || 0x77baff);
    }

    const material = atmosphere.material;
    if (!material.uniforms?.atmosphereColor) return;
    material.uniforms.atmosphereColor.value.set(frameContext.atmosphereColor || 0x77baff);
    material.uniforms.intensity.value = Math.max(0.02, frameContext.atmosphereIntensity ?? 0.12) * (frameContext.profile?.type === 'gas' ? 0.72 : 1.15);
    material.uniforms.lightDirection.value.copy(getLightDirection(context, frameContext));
    material.uniforms.time.value += deltaTime;
}

function updatePlanetMaterial(context, options, frameContext) {
    const planet = frameContext.planetMesh;
    if (!planet?.isMesh || !planet.material?.isMeshStandardMaterial) return;
    const material = planet.material;
    if (!material.userData.cinematicOriginal) {
        material.userData.cinematicOriginal = {
            roughness: material.roughness,
            metalness: material.metalness,
            envMapIntensity: material.envMapIntensity,
            emissiveIntensity: material.emissiveIntensity
        };
    }

    const original = material.userData.cinematicOriginal;
    if (!options.enabled) {
        material.roughness = original.roughness;
        material.metalness = original.metalness;
        material.envMapIntensity = original.envMapIntensity;
        material.emissiveIntensity = original.emissiveIntensity;
        return;
    }

    const wetSurface = ['terrestrial', 'oceanic', 'ice', 'alien'].includes(frameContext.profile?.type) && (frameContext.waterLevel ?? 0) > 0.05;
    material.roughness = wetSurface ? Math.min(original.roughness, 0.38) : Math.max(0.32, original.roughness * 0.9);
    material.metalness = wetSurface ? Math.max(original.metalness, 0.035) : original.metalness;
    material.envMapIntensity = Math.max(original.envMapIntensity || 0, wetSurface ? 0.45 : 0.18);
    if (frameContext.profile?.type === 'volcanic') {
        material.emissiveIntensity = Math.max(original.emissiveIntensity || 0, 0.22);
    }
}

function updateOceanSheen(context, options, frameContext) {
    const planet = frameContext.planetMesh;
    const profileType = frameContext.profile?.type;
    const canShow = options.enabled && options.fakeReflections && planet?.isMesh && ['terrestrial', 'oceanic', 'ice', 'alien'].includes(profileType) && (frameContext.waterLevel ?? 0) > 0.05;
    if (!canShow) {
        disposeOceanSheen(context);
        return;
    }

    planet.geometry.computeBoundingSphere();
    const radius = planet.geometry.boundingSphere?.radius || 10;
    if (!context.oceanSheen || !context.oceanSheen.parent || context.oceanSheenParent !== planet.parent) {
        disposeOceanSheen(context);
        context.oceanSheen = createOceanSheen(radius);
        context.oceanSheenParent = planet.parent;
        planet.parent?.add(context.oceanSheen);
    }

    context.oceanSheen.position.copy(planet.position);
    context.oceanSheen.rotation.copy(planet.rotation);
    context.oceanSheen.material.uniforms.lightDirection.value.copy(getLightDirection(context, frameContext));
    context.oceanSheen.material.uniforms.waterLevel.value = frameContext.waterLevel ?? 0.35;
    context.oceanSheen.material.uniforms.intensity.value = Math.min(0.34, 0.16 + (options.intensity ?? 1) * 0.08);
}

function disposeOceanSheen(context) {
    if (!context?.oceanSheen) return;
    context.oceanSheen.parent?.remove(context.oceanSheen);
    context.oceanSheen.geometry?.dispose();
    context.oceanSheen.material?.dispose();
    context.oceanSheen = null;
    context.oceanSheenParent = null;
}

function applyShadowSettings(context, options, frameContext, force = false) {
    const enabled = Boolean(options.enabled && options.shadows && options.shadowQuality !== 'off');
    const renderer = context.renderer;
    if (!renderer?.shadowMap) return;

    renderer.shadowMap.enabled = enabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const mapSizes = { low: 512, medium: 1024, high: 2048, cinematic: 2048 };
    const size = mapSizes[options.shadowQuality] || 512;
    const mainLight = context.lights.mainLight;
    if (mainLight?.shadow) {
        mainLight.castShadow = enabled;
        mainLight.shadow.mapSize.set(size, size);
        mainLight.shadow.camera.near = 1;
        mainLight.shadow.camera.far = 260;
        mainLight.shadow.camera.left = -70;
        mainLight.shadow.camera.right = 70;
        mainLight.shadow.camera.top = 70;
        mainLight.shadow.camera.bottom = -70;
        mainLight.shadow.needsUpdate = true;
    }

    context.shadowRefreshTimer = (context.shadowRefreshTimer || 0) - (frameContext.deltaTime || 0);
    if (!enabled || (!force && context.shadowRefreshTimer > 0)) return;
    context.shadowRefreshTimer = 0.7;

    context.scene.traverse((object) => {
        if (!object.isMesh || object.isSprite || object.userData?.cinematicLighting) return;
        const material = Array.isArray(object.material) ? object.material[0] : object.material;
        if (material?.transparent && material.opacity < 0.9) return;
        const radius = object.geometry?.boundingSphere?.radius || object.geometry?.parameters?.radius || 0;
        object.castShadow = radius > 0.25;
        object.receiveShadow = object === frameContext.planetMesh || radius > 1.4;
    });
}

export function createCinematicLighting(scene, renderer, camera, options = {}) {
    const presetOptions = copyPresetOptions(options.preset || DEFAULT_OPTIONS.preset);
    const context = {
        scene,
        renderer,
        camera,
        composer: options.composer || null,
        options: { ...DEFAULT_OPTIONS, ...presetOptions, ...options },
        lights: options.lights || {},
        originalRenderer: renderer ? {
            outputColorSpace: renderer.outputColorSpace,
            outputEncoding: renderer.outputEncoding,
            toneMapping: renderer.toneMapping,
            toneMappingExposure: renderer.toneMappingExposure,
            shadowMapEnabled: renderer.shadowMap?.enabled
        } : null,
        tempLightDirection: new THREE.Vector3()
    };

    context.hemisphereLight = new THREE.HemisphereLight(0x9fc7ff, 0x120b18, 0);
    context.hemisphereLight.name = 'CinematicHemisphereLight';
    scene.add(context.hemisphereLight);

    context.rimLight = new THREE.DirectionalLight(0x9bbcff, 0);
    context.rimLight.name = 'CinematicRimLight';
    scene.add(context.rimLight);

    context.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.3, 0.72);
    context.gradePass = new ShaderPass(gradeShader);
    insertPassBefore(context.composer, context.bloomPass, options.insertBeforePass);
    insertPassBefore(context.composer, context.gradePass, options.insertBeforePass);

    activeContext = context;
    applyLightingPreset(context.options.preset, context);
    return context;
}

export function applyLightingPreset(presetName, context = activeContext) {
    const preset = copyPresetOptions(presetName);
    const normalized = normalizePresetName(presetName);
    if (!context) return { ...DEFAULT_OPTIONS, ...preset, preset: normalized };

    const keepEnabled = context.options.enabled;
    context.options = {
        ...context.options,
        ...preset,
        preset: normalized,
        enabled: keepEnabled
    };
    return { ...context.options };
}

export function updateLightingSettings(settings = {}, context = activeContext) {
    if (!context) return { ...settings };
    context.options = { ...context.options, ...settings };
    return { ...context.options };
}

export function updateCinematicLighting(deltaTime = 0.016, context = activeContext, frameContext = {}) {
    if (!context) return;
    const options = context.options;
    frameContext.deltaTime = deltaTime;

    applyRendererColorManagement(context.renderer, options, context.originalRenderer);
    updatePostProcessing(context, options);

    if (!options.enabled) {
        context.hemisphereLight.visible = false;
        context.rimLight.visible = false;
        updateAtmosphere(context, options, frameContext, deltaTime);
        updatePlanetMaterial(context, options, frameContext);
        disposeOceanSheen(context);
        applyShadowSettings(context, options, frameContext);
        return;
    }

    updateLights(context, options, frameContext);
    updateAtmosphere(context, options, frameContext, deltaTime);
    updatePlanetMaterial(context, options, frameContext);
    updateOceanSheen(context, options, frameContext);
    applyShadowSettings(context, options, frameContext);
}

export function disposeCinematicLighting(context = activeContext) {
    if (!context) return;
    disposeOceanSheen(context);
    context.scene?.remove(context.hemisphereLight);
    context.scene?.remove(context.rimLight);
    removePass(context.composer, context.bloomPass);
    removePass(context.composer, context.gradePass);
    applyRendererColorManagement(context.renderer, { enabled: false, toneMapping: false }, context.originalRenderer);
    if (context.renderer?.shadowMap && context.originalRenderer?.shadowMapEnabled !== undefined) {
        context.renderer.shadowMap.enabled = context.originalRenderer.shadowMapEnabled;
    }
    if (activeContext === context) activeContext = null;
}
