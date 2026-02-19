import { isHTML, plainTextToHTML } from '@/components/ui/TipTapEditor';

/**
 * Normalizes content for comparison by removing extra whitespace and HTML formatting
 */
function normalizeContent(content: string): string {
  if (!content) return '';
  
  if (isHTML(content)) {
    // Convert HTML to plain text for comparison
    return content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()
      .toLowerCase();
  } else {
    // Normalize plain text
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()
      .toLowerCase();
  }
}

/**
 * Detects if the content already contains the specific signature
 */
export function hasSignature(content: string, signature?: string): boolean {
  if (!content) return false;
  
  // If we have a specific signature to check for, use it
  if (signature) {
    const normalizedContent = normalizeContent(content);
    const normalizedSignature = normalizeContent(signature);
    
    if (!normalizedSignature) return false;
    
    return normalizedContent.includes(normalizedSignature);
  }
  
  // Fallback: Check for common signature patterns (legacy behavior)
  const lowerContent = content.toLowerCase();
  const signaturePatterns = [
    'best regards',
    'sincerely', 
    'thank you',
    'thanks',
    'regards',
    'cheers',
    'yours truly',
    'kind regards',
    'warm regards',
    'best wishes',
    'yours sincerely',
    'yours faithfully'
  ];
  
  const contentLength = content.length;
  const lastPortion = lowerContent.slice(Math.max(0, contentLength - 500));
  
  return signaturePatterns.some(pattern => lastPortion.includes(pattern));
}

/**
 * Finds the exact signature location in content and returns the index
 */
function findSignatureIndex(content: string, signature: string): number {
  if (!content || !signature) return -1;
  
  const contentIsHTML = isHTML(content);
  const signatureIsHTML = isHTML(signature);
  
  // Try exact match first
  let searchSignature = signature;
  let searchContent = content;
  
  // If formats don't match, normalize both for searching
  if (contentIsHTML && !signatureIsHTML) {
    // Convert signature to HTML for searching
    searchSignature = plainTextToHTML(signature);
  } else if (!contentIsHTML && signatureIsHTML) {
    // Convert signature to plain text for searching
    searchSignature = signature
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .trim();
  }
  
  // Try case-insensitive exact match
  const exactIndex = searchContent.toLowerCase().indexOf(searchSignature.toLowerCase());
  if (exactIndex !== -1) {
    return exactIndex;
  }
  
  // Try normalized match (remove extra whitespace, etc.)
  const normalizedContent = normalizeContent(content);
  const normalizedSignature = normalizeContent(signature);
  
  if (normalizedSignature) {
    const normalizedIndex = normalizedContent.indexOf(normalizedSignature);
    if (normalizedIndex !== -1) {
      // Find approximate position in original content
      // This is approximate but should work for most cases
      const approximateRatio = normalizedIndex / normalizedContent.length;
      return Math.floor(approximateRatio * content.length);
    }
  }
  
  return -1;
}

/**
 * Strips existing signature from content if present
 */
export function stripSignature(content: string, signature?: string): string {
  if (!content) return content;
  
  // If we have a specific signature, try to remove it precisely
  if (signature) {
    const signatureIndex = findSignatureIndex(content, signature);
    if (signatureIndex !== -1) {
      // Remove everything from the signature onwards
      return content.substring(0, signatureIndex).trim();
    }
    return content; // Signature not found, return original
  }
  
  // Fallback: Use generic signature removal (legacy behavior)
  if (!hasSignature(content)) return content;
  
  const signatureStarters = [
    '\n\nBest regards,',
    '\n\nSincerely,', 
    '\n\nThank you,',
    '\n\nThanks,',
    '\n\nRegards,',
    '\n\nCheers,',
    '\n\nYours truly,',
    '\n\nKind regards,',
    '\n\nWarm regards,',
    '\n\nBest wishes,',
    '\n\nYours sincerely,',
    '\n\nYours faithfully,'
  ];
  
  if (isHTML(content)) {
    const htmlSignatureStarters = signatureStarters.map(starter => 
      starter.replace(/\n/g, '<br>').replace(/\n\n/g, '<br><br>')
    );
    
    for (const starter of htmlSignatureStarters) {
      const index = content.toLowerCase().indexOf(starter.toLowerCase());
      if (index !== -1) {
        return content.substring(0, index).trim();
      }
    }
  } else {
    for (const starter of signatureStarters) {
      const index = content.toLowerCase().indexOf(starter.toLowerCase());
      if (index !== -1) {
        return content.substring(0, index).trim();
      }
    }
  }
  
  return content;
}

/**
 * Appends signature to content if not already present
 */
export function appendSignature(content: string, signature: string): string {
  if (!signature) return content;
  
  // Check if signature already exists
  if (hasSignature(content, signature)) {
    return content; // Signature already present, don't add it again
  }
  
  // Strip any existing signatures first (using generic detection)
  const cleanContent = stripSignature(content);
  
  // Ensure signature is in the right format (HTML if content is HTML)
  let formattedSignature = signature;
  const contentIsHTML = isHTML(cleanContent);
  const signatureIsHTML = isHTML(signature);
  
  if (contentIsHTML && !signatureIsHTML) {
    formattedSignature = plainTextToHTML(signature);
  } else if (!contentIsHTML && signatureIsHTML) {
    // Convert HTML signature to plain text (simplified)
    formattedSignature = signature
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .trim();
  }
  
  // Add appropriate spacing - single line break like Gmail
  if (contentIsHTML) {
    return cleanContent + '<br>' + formattedSignature;
  } else {
    return cleanContent + '\n' + formattedSignature;
  }
}

/**
 * Updates content with new signature, replacing old one if present
 */
export function updateSignature(content: string, newSignature: string, oldSignature?: string): string {
  if (!newSignature) return content;
  
  // Check if the exact new signature already exists
  if (hasSignature(content, newSignature)) {
    return content; // New signature already present, no changes needed
  }
  
  // Remove old signature if specified and present
  let cleanContent = content;
  if (oldSignature && hasSignature(content, oldSignature)) {
    cleanContent = stripSignature(content, oldSignature);
  } else {
    // Fallback: remove any generic signatures
    cleanContent = stripSignature(content);
  }
  
  return appendSignature(cleanContent, newSignature);
}
