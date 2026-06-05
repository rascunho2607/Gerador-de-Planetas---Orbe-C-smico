# Orbe Cósmico — Gerador de Planetas Procedurais

Projeto em HTML/JavaScript com Three.js para gerar planetas procedurais, cenários espaciais e vida dinossauriana sobre a superfície.

## O que este projeto faz

- Gera planetas com terrenos dinâmicos e texturas orgânicas.
- Ajusta atmosfera, nuvens, luas, anéis e iluminação em tempo real.
- Cria um universo procedural com estrelas, nebulosas e objetos decorativos.
- Adiciona vida em superfícies planetárias com sprites de dinossauros animados.

## Tecnologias principais

- HTML5 + CSS3
- JavaScript ES modules
- Three.js
- simplex-noise
- Sprites 2D para animação de dinossauros

## Estrutura do projeto

- `index.html` — interface principal, painel de controles e inicialização da cena.
- `js/dino-life.js` — sistema de vida procedural com dinossauros e animações.
- `sprites/` — ativos visuais dos dinossauros e animações por espécie.

## Como executar

Recomendação: use um servidor local simples, porque o projeto usa módulos ES e import maps.

### Opção 1 — servidor local rápido

No terminal, na pasta do projeto:

```bash
python -m http.server 8000
```

Depois abra:

```text
http://localhost:8000/
```

### Opção 2 — abrir diretamente no navegador

Você pode abrir `index.html` diretamente, mas alguns navegadores podem apresentar limitações com módulos ES. Para a experiência completa, prefira o servidor local.

## Como usar

1. Abra a aplicação no navegador.
2. No painel lateral, ajuste o planeta, atmosfera, universo e vida.
3. Clique em "NOVO PLANETA" para gerar um novo cenário.
4. Use o mouse para girar, aproximar e explorar a cena.

## Observações

- O projeto depende de bibliotecas carregadas via CDN.
- Alguns recursos visuais e sprites podem variar conforme a conexão e o navegador.
- A pasta `sprites/` é essencial para a exibição da vida dinosauriana.

## Desenvolvimento

Se quiser expandir o projeto, os pontos naturais para evolução são:

- novos presets de planetas;
- mais espécies de vida;
- efeitos de clima e chuva;
- exportação de screenshots ou cenas.
