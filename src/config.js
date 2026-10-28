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
        x: 5.4, angle: -5.3,
        one: { baseline: 38.4, cap: 15.8, maxW: 55, minScale: 0.72 },
        two: { baselines: [29.8, 43.4], cap: 12.3, maxW: 58, minScale: 0.72 },
      },
      price: { height: 32.7, baseline: 80.6, group: { x0: 11.5, x1: 82.0 } },
      grn: { baseline: 80.4, cap: 9.6, stretch: 1.38, gap: 2.0 },
    },
    S: {
      key: 'S', label: 'Малий',
      tagW: 83, tagH: 65, radius: 2.2,
      cols: 2, rows: 4, cellW: 90, cellH: 70,
      name: {
        x: 4.6, angle: -4.2,
        one: { baseline: 25.0, cap: 10.0, maxW: 47, minScale: 0.70 },
        two: { baselines: [16.2, 26.6], cap: 9.0, maxW: 48, minScale: 0.70 },
      },
      price: { height: 27.6, baseline: 60.4, group: { x0: 11.5, x1: 73.8 } },
      grn: { baseline: 60.0, cap: 8.0, stretch: 1.38, gap: 2.8 },
    },
  },
};
