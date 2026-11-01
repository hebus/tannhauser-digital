// `import.meta.glob` (registre des plateaux, voir index.ts) : seule l'augmentation d'ImportMeta de Vite, sans
// `vite/client` qui exige les types du DOM (ce paquet est aussi chargé sous Node : Vitest, générateur).
/// <reference types="vite/types/importMeta.d.ts" />
