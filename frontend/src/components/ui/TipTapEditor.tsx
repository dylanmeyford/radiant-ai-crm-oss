import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { 
  Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon, 
  Image as ImageIcon, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Palette
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import './tiptap-styles.css'; // Import custom styles

// Utility functions for content handling
export const isHTML = (text: string): boolean => {
  // More robust HTML detection than just checking for < and >
  const htmlRegex = /<\/?[a-z][\s\S]*>/i;
  return htmlRegex.test(text);
};

export const plainTextToHTML = (text: string): string => {
  if (!text) return '<p><br></p>';
  // Convert plain text to HTML with proper paragraphs
  return '<p>' + text.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
};

export const formatEmailContent = (
  mode: 'reply' | 'replyAll' | 'forward',
  originalEmail: { 
    from?: Array<{name?: string; email: string}>;
    date?: string;
    body?: string;
    htmlBody?: string;
  }
): string => {
  let formattedContent = '<p><br></p>';
  
  // Add a separator line with original sender and date information
  const sender = originalEmail.from?.[0]?.name || originalEmail.from?.[0]?.email || 'Sender';
  let dateStr = 'unknown date';
  if (originalEmail.date) {
    const date = new Date(originalEmail.date);
    dateStr = date.toLocaleString();
  }
  
  const quotedHeader = `<p>On ${dateStr}, ${sender} wrote:</p>`;
  
  // Get the original content, prefer HTML if available
  let originalContent = '';
  if (originalEmail.htmlBody) {
    originalContent = originalEmail.htmlBody;
  } else if (originalEmail.body && isHTML(originalEmail.body)) {
    originalContent = originalEmail.body;
  } else if (originalEmail.body) {
    originalContent = plainTextToHTML(originalEmail.body);
  }
  
  // Create the quote styling with a left border
  const quotedContent = `
    <div style="margin-top: 10px; margin-bottom: 10px; padding-left: 10px; border-left: 2px solid #ccc;">
      ${quotedHeader}
      <div style="margin-top: 5px;">
        ${originalContent}
      </div>
    </div>
  `;
  
  // For forward, add header indicating it's a forwarded message
  if (mode === 'forward') {
    formattedContent = `
      <p><br></p>
      <p>---------- Forwarded message ----------</p>
      ${quotedContent}
    `;
  } else {
    // For replies
    formattedContent = `<p><br></p>${quotedContent}`;
  }
  
  return formattedContent;
};

export const getPlainTextFromHTML = (html: string): string => {
  // Use DOMParser for more accurate HTML to text conversion
  if (typeof window !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  }
  
  // Fallback for server-side rendering
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || '';
};

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
}

// Custom Link component with a dialog
const LinkMenu = ({ editor }: { editor: Editor | null }) => {
  const [url, setUrl] = useState<string>('');
  const [open, setOpen] = useState<boolean>(false);

  const onSubmit = () => {
    if (url) {
      editor?.chain().focus().setLink({ href: url }).run();
    } else if (editor?.isActive('link')) {
      editor?.chain().focus().unsetLink().run();
    }
    setUrl('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={editor?.isActive('link') ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            if (editor?.isActive('link')) {
              editor?.chain().focus().unsetLink().run();
              return;
            }
            setOpen(true);
          }}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="url" className="text-sm font-medium">
            Link URL
          </label>
          <Input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onSubmit}
            >
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Custom Image component with a dialog
const ImageMenu = ({ editor }: { editor: Editor | null }) => {
  const [url, setUrl] = useState<string>('');
  const [open, setOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = () => {
    if (url) {
      editor?.chain().focus().setImage({ src: url }).run();
    }
    setUrl('');
    setOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Only accept image files
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setIsLoading(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        editor?.chain().focus().setImage({ src: dataUrl }).run();
        setOpen(false);
      }
      setIsLoading(false);
    };
    reader.onerror = () => {
      setIsLoading(false);
      alert('Error reading file');
    };
    reader.readAsDataURL(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setOpen(true)}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2">
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="image-url" className="text-sm font-medium block mb-2">
              Image URL
            </label>
            <Input
              id="image-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
          </div>
          
          <div className="text-center my-1">
            <span className="text-xs text-muted-foreground">OR</span>
          </div>
          
          <div>
            <input 
              ref={fileInputRef}
              type="file" 
              className="hidden" 
              accept="image/*"
              onChange={handleFileUpload} 
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={triggerFileInput}
              disabled={isLoading}
            >
              {isLoading ? "Uploading..." : "Upload from your device"}
            </Button>
          </div>
          
          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={!url || isLoading}
            >
              Insert URL Image
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Add a Color Picker component
const ColorMenu = ({ editor }: { editor: Editor | null }) => {
  const [open, setOpen] = useState<boolean>(false);
  
  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF', 
    '#FFFF00', '#FF00FF', '#00FFFF', '#FF6600',
    '#663399', '#999999', '#333333', '#CC0000'
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative group"
          onClick={() => setOpen(true)}
        >
          <Palette className="h-4 w-4" />
          <div 
            className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-4 h-1 rounded-sm opacity-80" 
            style={{ 
              backgroundColor: editor?.getAttributes('textStyle').color || 'transparent',
              display: editor?.isActive('textStyle') ? 'block' : 'none'
            }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="flex flex-wrap gap-1 max-w-[192px]">
          {colors.map((color) => (
            <button
              key={color}
              onClick={() => {
                editor?.chain().focus().setColor(color).run();
                setOpen(false);
              }}
              className="w-8 h-8 rounded-md border border-border hover:scale-110 transition-transform"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
          <button
            onClick={() => {
              editor?.chain().focus().unsetColor().run();
              setOpen(false);
            }}
            className="w-8 h-8 rounded-md border border-border hover:scale-110 flex items-center justify-center bg-background"
            title="Clear color"
          >
            <div className="w-6 h-1 bg-red-500 rotate-45" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const MenuBar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mb-2 border border-border rounded-md p-1">
      <Button
        variant={editor.isActive('bold') ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </Button>
      
      <Button
        variant={editor.isActive('italic') ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </Button>
      
      <Button
        variant={editor.isActive('underline') ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={!editor.can().chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" />
      </Button>
      
      <ColorMenu editor={editor} />
      
      <div className="border-r border-border h-6 mx-1" />
      
      <Button
        variant={editor.isActive({ textAlign: 'left' }) ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        <AlignLeft className="h-4 w-4" />
      </Button>
      
      <Button
        variant={editor.isActive({ textAlign: 'center' }) ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      
      <Button
        variant={editor.isActive({ textAlign: 'right' }) ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        <AlignRight className="h-4 w-4" />
      </Button>
      
      <div className="border-r border-border h-6 mx-1" />
      
      <Button
        variant={editor.isActive('bulletList') ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </Button>
      
      <Button
        variant={editor.isActive('orderedList') ? "secondary" : "ghost"}
        size="icon"
        className="h-8 w-8"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </Button>
      
      <div className="border-r border-border h-6 mx-1" />
      
      <LinkMenu editor={editor} />
      <ImageMenu editor={editor} />
    </div>
  );
};

const TipTapEditor = ({ content, onChange, editable = true }: TipTapEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
      }),
      BulletList.configure({
        keepMarks: true,
        keepAttributes: true,
      }),
      OrderedList.configure({
        keepMarks: true,
        keepAttributes: true,
      }),
      ListItem,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
        validate: url => /^https?:\/\//.test(url),
      }),
      Image.configure({
        allowBase64: true,
        inline: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right'],
        defaultAlignment: 'left',
      }),
      TextStyle,
      Color.configure({
        types: ['textStyle'],
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'min-h-[200px] max-h-[300px] p-3 border border-input rounded-md focus-within:ring-1 focus-within:ring-ring focus-within:border-input overflow-auto tiptap-content',
      },
    },
    onCreate: ({ editor }) => {
      console.log('TipTap Editor created', {
        availableExtensions: editor.extensionManager.extensions.map(ext => ext.name),
        canDoOrderedList: editor.can().toggleOrderedList(),
        canDoBulletList: editor.can().toggleBulletList(),
        isEditable: editor.isEditable
      });
    },
  });

  // Update content from props when it changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  return (
    <div className="tiptap-editor">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
};

export default TipTapEditor;
