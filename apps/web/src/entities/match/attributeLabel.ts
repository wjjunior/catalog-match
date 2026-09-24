import type { AttributeName } from '../../shared/api/client';

const LABELS: Record<AttributeName, string> = {
  diameter: 'Diameter',
  pitch: 'Pitch',
  length: 'Length',
  type: 'Type',
  material: 'Material',
  finish: 'Finish',
  standard: 'Standard',
};

export function attributeLabel(attr: AttributeName): string {
  return LABELS[attr];
}
