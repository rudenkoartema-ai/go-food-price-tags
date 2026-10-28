'use strict';
/**
 * All physical sizes live here (millimetres). Nothing in the code hard-codes them.
 * Tag sizes were measured from the owner's reference sheets (see README, "Размеры").
 */
module.exports = {
  page: { w: 210, h: 297 },
  limits: { maxTotal: 300, maxQty: 300, maxPrice: 99999, maxNameLen: 60 },

  // Optional shift of the whole grid (mm) to compensate a printer, positive = right / down
  printOffset: { x: 0, y: 0 },

  cut: { color: [0.55, 0.55, 0.55], thickness: 0.18, dash: [1.2, 1.2], tick: 3.5, tickGap: 1.5 },

  formats: {
    L: {
      key: 'L', label: 'Великий',
      tagW: 92, tagH: 88, radius: 2.6,
      cols: 2, rows: 3, cellW: 96, cellH: 92,
      name: {
        x: 6.0, angle: -5.9,
        one: { baseline: 39.8, cap: 15.5, maxW: 58, minScale: 0.70 },
        two: { baselines: [30.3, 44.3], cap: 11.9, maxW: 57, minScale: 0.60 },
      },
      price: { height: 32.9, baseline: 80.8, group: { x0: 12.1, x1: 82.0 } },
      grn: { baseline: 80.4, cap: 9.8, stretch: 1.136, gap: 0.4 },
    },
    S: {
      key: 'S', label: 'Малий',
      tagW: 83, tagH: 65, radius: 2.2,
      cols: 2, rows: 4, cellW: 90, cellH: 70,
      name: {
        x: 5.3, angle: -5.7,
        one: { baseline: 25.3, cap: 10.0, maxW: 47, minScale: 0.65 },
        two: { baselines: [16.9, 26.7], cap: 7.8, maxW: 47, minScale: 0.62 },
      },
      price: { height: 27.5, baseline: 60.8, group: { x0: 12.0, x1: 73.9 } },
      grn: { baseline: 60.2, cap: 8.3, stretch: 1.058, gap: 2.5 },
    },
  },
};
