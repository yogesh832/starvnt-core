/** A vendor enquiry carries only the customer's saved service requirements. */
export function serviceRequirementSummary(requirement, option, event) {
  return [option.packageName, requirement?.specialRequirements,
    requirement?.preferences && Object.entries(requirement.preferences).map(([key, value]) => `${key === 'customerBrief' ? 'Customer request' : key.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${Array.isArray(value) ? value.join(', ') : value}`).join(' | '),
    event?.guestCount ? `${event.guestCount} guests` : '',
  ].filter(Boolean).join(' · ') || 'Customer selected this vendor option and requested a formal quote.';
}
