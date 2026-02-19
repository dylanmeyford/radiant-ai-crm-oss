export function renderTemplate(
  template: string,
  variables: Record<string, any>
): string {
  try {
    // Escape backticks so we can wrap the template in a template literal
    const escaped = template.replace(/`/g, '\\`');
    
    // Build the function with access to common globals and the variables
    // Using 'with' to make all variable properties directly accessible
    // eslint-disable-next-line no-new-func
    const renderer = new Function(
      'vars',
      'JSON',
      'Date',
      'Array',
      'Object',
      'Math',
      `with (vars) { return \`${escaped}\`; }`
    );
    
    return renderer(variables, JSON, Date, Array, Object, Math);
  } catch (error) {
    // Log the error for debugging but don't expose to end users
    console.warn('[TemplateRenderer] new Function() evaluation failed, falling back to simple substitution:', error);
    
    // Fallback: simple ${path} substitution for basic variable references
    return template.replace(/\$\{([^}]+)\}/g, (match, expression) => {
      const path = String(expression || '').trim();
      
      // Only handle simple variable paths (e.g., "variableName" or "object.property")
      if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(path)) {
        console.warn(`[TemplateRenderer] Cannot evaluate complex expression: ${path.substring(0, 50)}...`);
        return match;
      }

      const value = path.split('.').reduce<any>((acc, key) => {
        if (acc && typeof acc === 'object' && key in acc) {
          return acc[key];
        }
        return undefined;
      }, variables);

      if (value === undefined || value === null) {
        return '';
      }

      return String(value);
    });
  }
}
