import { vendorThemeVariables } from '../../../shared/vendorTheme.js';

export function applyVendorTheme(root) {
  const previous = Object.entries(vendorThemeVariables).map(([key,value]) => {
    const saved = [key,root.style.getPropertyValue(key),root.style.getPropertyPriority(key)];
    root.style.setProperty(key,value);
    return saved;
  });
  return () => previous.forEach(([key,value,priority]) => {
    if (value) root.style.setProperty(key,value,priority);
    else root.style.removeProperty(key);
  });
}
