import { htmlToText } from 'html-to-text';

export function stripHtml(html: string): string {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  });
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function convertPlainTextToHtml(text: string): string {
  if (!text) {
    return '<p><br/></p>';
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const trimmed = paragraph.trimEnd();
      const withLineBreaks = escapeHtml(trimmed).replace(/\n/g, '<br/>');
      return withLineBreaks.length > 0 ? withLineBreaks : '<br/>';
    });

  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('');
}

/**
 * Sanitizes HTML content for use in quoted email content.
 * Removes document-level elements (head, style, meta) while preserving content formatting.
 */
export function sanitizeHtmlForQuoting(html: string): string {
  if (!html) return '';

  // Step 1: Extract body content if full HTML document (handle various formats)
  let content = html;
  
  // Try to extract body content - use GREEDY match to get all content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    content = bodyMatch[1];
  } else {
    // If no closing body tag, try to capture from <body> to end of string
    const bodyStartMatch = html.match(/<body[^>]*>([\s\S]*)/i);
    if (bodyStartMatch && bodyStartMatch[1]) {
      content = bodyStartMatch[1];
    } else {
      // If no body tag at all, try to find content after head/html tags
      const afterHeadMatch = html.match(/<\/head>([\s\S]*)/i);
      if (afterHeadMatch) {
        content = afterHeadMatch[1];
      }
    }
  }

  // Step 2: Aggressively remove ALL document-level elements (multiple passes to catch nested/edge cases)
  let sanitized = content;
  
  // Multiple passes to ensure we catch everything
  for (let i = 0; i < 3; i++) {
    sanitized = sanitized
      .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
      .replace(/<html[^>]*>/gi, '')
      .replace(/<\/html>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<head[^>]*>/gi, '')
      .replace(/<\/head>/gi, '')
      .replace(/<body[^>]*>/gi, '')
      .replace(/<\/body>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<link\b[^>]*?>/gi, '')
      .replace(/<meta[^>]*?>/gi, '')
      .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s*on[a-z]+\s*=\s*"(?:[^"\\]|\\.)*"/gi, '')
      .replace(/\s*on[a-z]+\s*=\s*'(?:[^'\\]|\\.)*'/gi, '')
      .replace(/\s*(mso-[^:"]*:[^;"']*;?)/gi, '')
      .replace(/\s*class="[^"]*Mso[^"]*"/gi, '')
      .replace(/\s*style="\s*"/gi, '')
      .replace(/\r\n/g, '\n');
  }

  sanitized = sanitized.trim();

  if (!sanitized) {
    return '';
  }

  // Step 3: Verify no document-level tags remain
  const hasDocTags = /<\/?(html|head|body|doctype)[^>]*>/i.test(sanitized);
  if (hasDocTags) {
    // If still has doc tags, extract text only
    const plainText = htmlToText(html, {
      wordwrap: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
      ],
    }).trim();

    if (!plainText) {
      return '';
    }

    return convertPlainTextToHtml(plainText);
  }

  // Step 4: Check if there's actual content (not just tags)
  const textOnly = sanitized.replace(/<[^>]*>/g, '').trim();

  if (!textOnly) {
    // Fallback to plain text conversion
    const plainText = htmlToText(html, {
      wordwrap: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
      ],
    }).trim();

    if (!plainText) {
      return '';
    }

    return convertPlainTextToHtml(plainText);
  }

  return sanitized;
}

export function addEmailThreadSeparators(text: string): string {
  const separator = "\n--- Previous Message ---\n";
  let processedText = text;

  const replyPatterns = [
    // Common reply headers
    /^On .* wrote:/im, // "On May 1, 2024, at 10:00 AM, User <user@example.com> wrote:"
    /^> On .* wrote:/im, // Same as above, but in a blockquote
    /^From: .*/im,
    /^Sent: .*/im,
    /^To: .*/im,
    /^Cc: .*/im,
    /^Bcc: .*/im,
    /^Date: .*/im,
    /^Subject: .*/im,

    // Full header blocks (often on one line)
    /^From: .* Sent: .* To: .* Subject: .*/im,

    // Forwarded and original message indicators
    /^-{5,}\s*Original Message\s*-{5,}/im,
    /^-{5,}\s*Forwarded message\s*-{5,}/im,
    /^_{5,}\s*Original Message\s*_{5,}/im,
    /^_{5,}\s*Forwarded message\s*_{5,}/im,
    /^Begin forwarded message:/im,
    /^--------\s*Forwarded Message\s*--------/im,
    /^________\n?From:/im, // Outlook forward underline
  ];

  for (const pattern of replyPatterns) {
    processedText = processedText.replace(pattern, (match) => `${separator}${match}`);
  }

  const lines = processedText.split('\n');
  let inBlockquote = false;
  const resultLines = lines.map(line => {
    const isQuoted = line.trim().startsWith('>');
    if (isQuoted && !inBlockquote) {
      inBlockquote = true;
      return `${separator}${line}`;
    }
    if (!isQuoted) {
      inBlockquote = false;
    }
    return line;
  });

  processedText = resultLines.join('\n');

  // Clean up duplicate separators and trim whitespace
  const separatorPattern = new RegExp(`(${separator.trim()}\\s*){2,}`, 'g');
  processedText = processedText.replace(separatorPattern, separator);

  return processedText.trim();
} 