/**
 * SpellStock inventory risk simulation. Same logic as before; plain JavaScript.
 */

export const RiskStatus = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

const BASE_INVENTORY = [
  { name: 'Fresh Salmon', currentStock: 12, unit: 'kg', reason: 'High perishability' },
  { name: 'Avocados', currentStock: 45, unit: 'units', reason: 'Rapid ripening' },
  { name: 'Whole Milk', currentStock: 20, unit: 'liters', reason: 'Daily usage peak' },
  { name: 'Sourdough Bread', currentStock: 8, unit: 'loaves', reason: 'Short shelf life' },
  { name: 'Chicken Breast', currentStock: 50, unit: 'kg', reason: 'Steady demand' },
  { name: 'Heavy Cream', currentStock: 15, unit: 'liters', reason: 'Low stock alert' },
  { name: 'Cherry Tomatoes', currentStock: 5, unit: 'kg', reason: 'Critically low' },
  { name: 'Unsalted Butter', currentStock: 12, unit: 'kg', reason: 'Baking dependency' },
];

export function simulateRisk(params) {
  const { demand_multiplier, horizon_hours } = params;

  return BASE_INVENTORY.map((item, index) => {
    let baseRisk = (index * 13) % 40 + 10;
    let calculatedRisk = baseRisk * demand_multiplier;
    calculatedRisk += (horizon_hours / 24) * 10;
    calculatedRisk = Math.min(100, Math.max(5, calculatedRisk));

    let status = RiskStatus.LOW;
    if (calculatedRisk > 85) status = RiskStatus.CRITICAL;
    else if (calculatedRisk > 65) status = RiskStatus.HIGH;
    else if (calculatedRisk > 35) status = RiskStatus.MODERATE;

    let customReason = item.reason || '';
    if (demand_multiplier > 1.3 && status === RiskStatus.CRITICAL) {
      customReason = `Spike in demand exceeds ${horizon_hours}h supply`;
    }

    return {
      id: `item-${index}`,
      name: item.name,
      currentStock: item.currentStock,
      unit: item.unit,
      riskPercent: Math.round(calculatedRisk),
      status,
      reason: customReason,
    };
  }).sort((a, b) => b.riskPercent - a.riskPercent);
}
