/**
 * Normalizes phone number to Indonesian format (628xxx)
 * @param phone 
 * @returns normalized phone number or original if invalid
 */
export function normalizePhone(phone: string): string {
  if (!phone) return phone;
  
  // Remove all non-numeric characters
  let normalized = phone.replace(/[^0-9]/g, '');
  
  // If starts with 08..., convert to 628...
  if (normalized.startsWith('08')) {
    normalized = '628' + normalized.slice(2);
  }
  
  // If starts with 8..., convert to 628...
  if (normalized.startsWith('8')) {
    normalized = '628' + normalized.slice(1);
  }
  
  // Ensure it starts with 62
  if (!normalized.startsWith('62') && normalized.length >= 9) {
    // This is a bit risky but usually for ID numbers they just miss the prefix
    // We'll leave it as is if it doesn't match common patterns
  }
  
  return normalized;
}
