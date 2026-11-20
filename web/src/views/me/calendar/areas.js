// One fixed color per campus area, used by the week calendar and the import preview.
// Categorical slots in a fixed order (validated with the dataviz palette check on the paper surface:
// adjacent CVD separation and normal-vision floor pass). Blocks always carry a text label, so color is
// never the only cue.
export const AREA_COLOR = {
  North: '#2a78d6',
  Central: '#eb6834',
  Medical: '#1baf7a',
  Downtown: '#eda100',
  South: '#e87ba4',
  East: '#008300',
  Southwest: '#6250d6',
};
export const OTHER_COLOR = '#8a8478';

export const areaColor = (area) => AREA_COLOR[area] || OTHER_COLOR;

// The fill behind a block: the area color at low strength, so ink text stays readable on it.
export const areaTint = (area) => `${areaColor(area)}2e`;
