const TOOL_CONFIGS = [
    { id: 'meteor', label: 'Meteoro', icon: 'fa-meteor', category: 'Impacto' },
    { id: 'laser', label: 'Laser', icon: 'fa-bolt', category: 'Energia' },
    { id: 'freeze', label: 'Gelo', icon: 'fa-snowflake', category: 'Extras' },
    { id: 'regen', label: 'Regenerar', icon: 'fa-seedling', category: 'Controle' }
];

const DEFAULT_STATE = {
    tool: 'meteor',
    power: 0.72,
    radius: 0.38,
    intensity: 0.62,
    continuous: false,
    meteorType: 'rocky',
    laserMode: 'pierce',
    catastrophic: false,
    meteorShower: false,
    fragmentsVisible: true,
    paused: false,
    slowMotion: false
};

function injectStyles() {
    if (document.getElementById('planetChaosToolbarStyles')) return;
    const style = document.createElement('style');
    style.id = 'planetChaosToolbarStyles';
    style.textContent = `
        .planet-chaos-shell {
            position: fixed;
            left: 50%;
            bottom: 14px;
            z-index: 24;
            width: min(1080px, calc(100vw - 24px));
            transform: translateX(-50%);
            display: grid;
            grid-template-columns: auto minmax(260px, 1fr) auto;
            gap: 10px;
            align-items: stretch;
            padding: 10px;
            color: #f7fbff;
            background: rgba(4, 8, 20, 0.78);
            border: 1px solid rgba(124, 175, 255, 0.28);
            border-radius: 8px;
            box-shadow: 0 14px 50px rgba(0, 0, 0, 0.48);
            backdrop-filter: blur(16px);
            pointer-events: auto;
        }

        .planet-chaos-shell.is-hidden {
            transform: translateX(-50%) translateY(calc(100% - 34px));
        }

        .planet-chaos-tools,
        .planet-chaos-actions {
            display: flex;
            gap: 7px;
            align-items: center;
        }

        .planet-chaos-tool,
        .planet-chaos-action,
        .planet-chaos-hide {
            width: 44px;
            height: 44px;
            padding: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            border: 1px solid rgba(130, 176, 255, 0.24);
            color: #f7fbff;
            background: rgba(13, 20, 40, 0.92);
            box-shadow: none;
            font-size: 1rem;
            letter-spacing: 0;
        }

        .planet-chaos-tool:hover,
        .planet-chaos-action:hover,
        .planet-chaos-hide:hover {
            transform: translateY(-1px);
            border-color: rgba(166, 204, 255, 0.68);
            background: rgba(32, 52, 92, 0.94);
        }

        .planet-chaos-tool.is-active {
            color: #061018;
            background: #9ed8ff;
            border-color: rgba(220, 245, 255, 0.9);
            box-shadow: 0 0 22px rgba(90, 185, 255, 0.45);
        }

        .planet-chaos-action.is-active {
            color: #081018;
            background: #ffc66e;
            border-color: rgba(255, 232, 180, 0.9);
        }

        .planet-chaos-panel {
            display: grid;
            grid-template-columns: repeat(3, minmax(92px, 1fr)) minmax(112px, 0.8fr);
            gap: 8px;
            align-items: end;
            min-width: 0;
        }

        .planet-chaos-field {
            display: grid;
            gap: 4px;
            min-width: 0;
            font-size: 0.68rem;
            color: rgba(235, 245, 255, 0.78);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .planet-chaos-field span {
            display: flex;
            justify-content: space-between;
            gap: 8px;
        }

        .planet-chaos-field input[type="range"] {
            width: 100%;
            accent-color: #91d6ff;
        }

        .planet-chaos-field select {
            min-height: 30px;
            border-radius: 6px;
            background: rgba(3, 8, 20, 0.95);
            border: 1px solid rgba(130, 176, 255, 0.28);
            color: #f7fbff;
            font: inherit;
            text-transform: none;
            letter-spacing: 0;
        }

        .planet-chaos-toggle {
            min-height: 30px;
            display: flex;
            gap: 8px;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            border: 1px solid rgba(130, 176, 255, 0.24);
            background: rgba(13, 20, 40, 0.92);
            color: rgba(235, 245, 255, 0.88);
            font-size: 0.72rem;
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }

        .planet-chaos-toggle input {
            width: 16px;
            height: 16px;
            accent-color: #91d6ff;
        }

        @media (max-width: 760px) {
            .planet-chaos-shell {
                grid-template-columns: 1fr auto;
            }

            .planet-chaos-panel {
                grid-column: 1 / -1;
                grid-template-columns: repeat(2, minmax(90px, 1fr));
                order: 3;
            }

            .planet-chaos-tools {
                overflow-x: auto;
                padding-bottom: 2px;
            }

            .planet-chaos-tool,
            .planet-chaos-action,
            .planet-chaos-hide {
                width: 40px;
                height: 40px;
                flex: 0 0 auto;
            }
        }
    `;
    document.head.appendChild(style);
}

export class PlanetChaosToolbar extends EventTarget {
    constructor(options = {}) {
        super();
        injectStyles();
        this.state = { ...DEFAULT_STATE, ...(options.initialState || {}) };
        this.tools = TOOL_CONFIGS;
        this.element = this.createElement();
        document.body.appendChild(this.element);
        this.sync();
    }

    createElement() {
        const root = document.createElement('div');
        root.className = 'planet-chaos-shell';
        root.innerHTML = `
            <div class="planet-chaos-tools" role="toolbar" aria-label="Modo caos planetario">
                ${this.tools.map((tool) => `
                    <button class="planet-chaos-tool" type="button" data-tool="${tool.id}" title="${tool.category}: ${tool.label}" aria-label="${tool.label}">
                        <i class="fas ${tool.icon}"></i>
                    </button>
                `).join('')}
            </div>
            <div class="planet-chaos-panel">
                <label class="planet-chaos-field">
                    <span>Forca <b data-readout="power"></b></span>
                    <input data-setting="power" type="range" min="0.05" max="1" step="0.01">
                </label>
                <label class="planet-chaos-field">
                    <span>Raio <b data-readout="radius"></b></span>
                    <input data-setting="radius" type="range" min="0.08" max="1" step="0.01">
                </label>
                <label class="planet-chaos-field">
                    <span>Intensidade <b data-readout="intensity"></b></span>
                    <input data-setting="intensity" type="range" min="0.05" max="1" step="0.01">
                </label>
                <label class="planet-chaos-field">
                    <span>Tipo</span>
                    <select data-setting="meteorType">
                        <option value="rocky">Rochoso</option>
                        <option value="metallic">Metalico</option>
                        <option value="icy">Gelado</option>
                        <option value="explosive">Explosivo</option>
                    </select>
                </label>
                <label class="planet-chaos-field">
                    <span>Laser</span>
                    <select data-setting="laserMode">
                        <option value="dig">Escavar</option>
                        <option value="pierce">Perfurar</option>
                        <option value="cut">Cortar</option>
                        <option value="annihilate">Aniquilar</option>
                    </select>
                </label>
                <label class="planet-chaos-toggle" title="Mantem a ferramenta ativa enquanto o mouse estiver pressionado">
                    <input data-setting="continuous" type="checkbox"> Continuo
                </label>
                <label class="planet-chaos-toggle" title="Dispara varios meteoros proximos do alvo">
                    <input data-setting="meteorShower" type="checkbox"> Chuva
                </label>
                <label class="planet-chaos-toggle" title="Aumenta remocao de massa e fragmentos do impacto">
                    <input data-setting="catastrophic" type="checkbox"> Catastrofico
                </label>
            </div>
            <div class="planet-chaos-actions" role="toolbar" aria-label="Controles do caos">
                <button class="planet-chaos-action" type="button" data-action="undo" title="Desfazer"><i class="fas fa-undo"></i></button>
                <button class="planet-chaos-action" type="button" data-action="redo" title="Refazer"><i class="fas fa-redo"></i></button>
                <button class="planet-chaos-action" type="button" data-action="reset" title="Resetar dano"><i class="fas fa-eraser"></i></button>
                <button class="planet-chaos-action" type="button" data-action="fragmentsVisible" title="Mostrar/ocultar detritos"><i class="fas fa-cubes"></i></button>
                <button class="planet-chaos-action" type="button" data-action="slowMotion" title="Slow motion"><i class="fas fa-hourglass-half"></i></button>
                <button class="planet-chaos-action" type="button" data-action="paused" title="Pausar caos"><i class="fas fa-pause"></i></button>
                <button class="planet-chaos-hide" type="button" data-action="hide" title="Esconder toolbar"><i class="fas fa-chevron-down"></i></button>
            </div>
        `;

        root.querySelectorAll('[data-tool]').forEach((button) => {
            button.addEventListener('click', () => {
                this.state.tool = button.dataset.tool;
                this.sync();
                this.emit('tool-change');
            });
        });

        root.querySelectorAll('[data-setting]').forEach((input) => {
            const eventName = input.type === 'range' ? 'input' : 'change';
            input.addEventListener(eventName, () => {
                this.state[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
                this.sync();
                this.emit('settings-change');
            });
        });

        root.querySelectorAll('[data-action]').forEach((button) => {
            button.addEventListener('click', () => {
                const action = button.dataset.action;
                if (action === 'hide') {
                    root.classList.toggle('is-hidden');
                    button.innerHTML = root.classList.contains('is-hidden') ? '<i class="fas fa-chevron-up"></i>' : '<i class="fas fa-chevron-down"></i>';
                    return;
                }
                if (action === 'paused' || action === 'slowMotion' || action === 'fragmentsVisible') {
                    this.state[action] = !this.state[action];
                    this.sync();
                }
                this.emit(action);
            });
        });

        return root;
    }

    emit(type) {
        this.dispatchEvent(new CustomEvent(type, { detail: this.getState() }));
    }

    getState() {
        return { ...this.state };
    }

    sync() {
        this.element.querySelectorAll('[data-tool]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.tool === this.state.tool);
        });
        this.element.querySelectorAll('[data-setting]').forEach((input) => {
            const value = this.state[input.dataset.setting];
            if (input.type === 'checkbox') input.checked = Boolean(value);
            else input.value = value;
        });
        this.element.querySelectorAll('[data-readout]').forEach((readout) => {
            readout.textContent = Number(this.state[readout.dataset.readout] || 0).toFixed(2);
        });
        this.element.querySelector('[data-action="paused"]')?.classList.toggle('is-active', this.state.paused);
        this.element.querySelector('[data-action="slowMotion"]')?.classList.toggle('is-active', this.state.slowMotion);
        this.element.querySelector('[data-action="fragmentsVisible"]')?.classList.toggle('is-active', this.state.fragmentsVisible);
        this.element.querySelector('[data-setting="meteorType"]').closest('.planet-chaos-field').style.display = this.state.tool === 'meteor' ? 'grid' : 'none';
        this.element.querySelector('[data-setting="laserMode"]').closest('.planet-chaos-field').style.display = this.state.tool === 'laser' ? 'grid' : 'none';
        this.element.querySelector('[data-setting="meteorShower"]').closest('.planet-chaos-toggle').style.display = this.state.tool === 'meteor' ? 'flex' : 'none';
        this.element.querySelector('[data-setting="catastrophic"]').closest('.planet-chaos-toggle').style.display = this.state.tool === 'meteor' ? 'flex' : 'none';
    }

    dispose() {
        this.element.remove();
    }
}
